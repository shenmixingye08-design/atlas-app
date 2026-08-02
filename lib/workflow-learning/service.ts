import "server-only";

import {
  memoryGetAutomation,
  memoryListRunsForAutomation,
  memoryUpdateAutomation,
} from "@/lib/automation-platform/repository/memory-store";
import {
  ensureAutomationsV2Hydrated,
  schedulePersistAutomationsV2,
} from "@/lib/automation-platform/durable";
import { ensureAutomationRunsV2Hydrated } from "@/lib/automation-platform/durable-runs";
import { buildFeatureAccessContext, isFeatureEnabled } from "@/lib/feature-flags/access";
import { analyzeAutomationLearning, recordCorrection } from "@/lib/workflow-learning/analyze";
import {
  applyPatchToAutomation,
  isBlindRetryIncrease,
} from "@/lib/workflow-learning/apply-patch";
import { recordWorkflowLearningAudit } from "@/lib/workflow-learning/audit";
import {
  ensureWorkflowLearningHydrated,
  schedulePersistWorkflowLearning,
} from "@/lib/workflow-learning/durable";
import { newId } from "@/lib/workflow-learning/fingerprint";
import { compareMetrics, computeMetricsFromRuns } from "@/lib/workflow-learning/metrics";
import {
  createRevisionFromAutomation,
  ensureBaselineRevision,
  getLatestRevision,
  resolveRollbackSnapshot,
} from "@/lib/workflow-learning/revisions";
import {
  touchesExternalSend,
  WorkflowLearningError,
} from "@/lib/workflow-learning/security";
import {
  findActiveTrialForAutomation,
  findCandidate,
  findTrial,
  listCandidates,
  listRevisions,
  listTrials,
  readWorkflowLearningSettings,
  suppressFingerprint,
  upsertCandidate,
  upsertTrial,
  writeWorkflowLearningSettings,
} from "@/lib/workflow-learning/store";
import type {
  MetricsComparison,
  WorkflowLearningCandidate,
  WorkflowLearningSettings,
} from "@/lib/workflow-learning/types";

async function assertFlag(userId: string, email: string | null): Promise<void> {
  const ctx = buildFeatureAccessContext(email);
  if (!isFeatureEnabled("workflow_learning_enabled", ctx)) {
    throw new WorkflowLearningError(
      "改善提案機能は現在ご利用いただけません",
      "flag_off",
      403,
    );
  }
  await ensureWorkflowLearningHydrated(userId);
}

function assertOwner(userId: string, resourceUserId: string): void {
  if (userId !== resourceUserId) {
    throw new WorkflowLearningError("権限がありません", "forbidden", 403);
  }
}

export async function getWorkflowLearningSettingsForUser(
  userId: string,
  email: string | null,
): Promise<WorkflowLearningSettings> {
  await assertFlag(userId, email);
  return readWorkflowLearningSettings(userId);
}

export async function updateWorkflowLearningSettingsForUser(
  userId: string,
  email: string | null,
  patch: Partial<WorkflowLearningSettings>,
): Promise<WorkflowLearningSettings> {
  await assertFlag(userId, email);
  const current = readWorkflowLearningSettings(userId);
  const next = writeWorkflowLearningSettings(userId, {
    ...current,
    ...patch,
    thresholds: {
      ...current.thresholds,
      ...(patch.thresholds ?? {}),
    },
  });
  schedulePersistWorkflowLearning(userId);
  return next;
}

export async function listWorkflowCandidates(input: {
  userId: string;
  email: string | null;
  automationId?: string;
  status?: WorkflowLearningCandidate["status"] | "all";
}): Promise<WorkflowLearningCandidate[]> {
  await assertFlag(input.userId, input.email);
  let list = listCandidates(input.userId, input.automationId);
  if (input.status && input.status !== "all") {
    list = list.filter((c) => c.status === input.status);
  }
  return list;
}

export async function analyzeWorkflowLearningForAutomation(input: {
  userId: string;
  email: string | null;
  automationId: string;
}): Promise<WorkflowLearningCandidate[]> {
  await assertFlag(input.userId, input.email);
  await ensureAutomationsV2Hydrated(input.userId);
  await ensureAutomationRunsV2Hydrated(input.userId);

  const automation = memoryGetAutomation(input.automationId);
  if (!automation || automation.userId !== input.userId) {
    throw new WorkflowLearningError("自動化が見つかりません", "not_found", 404);
  }
  if (automation.status === "archived" || automation.status === "paused") {
    // Still allow viewing, but analysis can run to propose reconnect etc.
  }

  const runs = memoryListRunsForAutomation({
    userId: input.userId,
    automationId: input.automationId,
  });
  const candidates = analyzeAutomationLearning({
    userId: input.userId,
    automation,
    runs,
  });
  recordWorkflowLearningAudit({
    userId: input.userId,
    action: "analyze",
    automationId: input.automationId,
    outcome: "ok",
    meta: { count: candidates.length },
  });
  schedulePersistWorkflowLearning(input.userId);
  return candidates;
}

export async function recordWorkflowCorrection(input: {
  userId: string;
  email: string | null;
  automationId: string;
  text: string;
  runId?: string | null;
  source?: string | null;
}): Promise<{ signalCreated: boolean }> {
  await assertFlag(input.userId, input.email);
  const signal = recordCorrection({
    userId: input.userId,
    automationId: input.automationId,
    text: input.text,
    runId: input.runId,
    source: input.source,
  });
  schedulePersistWorkflowLearning(input.userId);
  return { signalCreated: Boolean(signal) };
}

export async function rejectCandidate(input: {
  userId: string;
  email: string | null;
  candidateId: string;
  suppressFuture?: boolean;
}): Promise<WorkflowLearningCandidate> {
  await assertFlag(input.userId, input.email);
  const candidate = findCandidate(input.userId, input.candidateId);
  if (!candidate) {
    throw new WorkflowLearningError("候補が見つかりません", "not_found", 404);
  }
  assertOwner(input.userId, candidate.userId);
  const next = upsertCandidate({
    ...candidate,
    status: input.suppressFuture ? "suppressed" : "rejected",
    updatedAt: new Date().toISOString(),
  });
  if (input.suppressFuture) {
    suppressFingerprint(input.userId, candidate.fingerprint);
  }
  recordWorkflowLearningAudit({
    userId: input.userId,
    action: input.suppressFuture ? "suppress" : "reject",
    automationId: candidate.automationId,
    candidateId: candidate.id,
    outcome: "ok",
  });
  schedulePersistWorkflowLearning(input.userId);
  return next;
}

export async function approveCandidate(input: {
  userId: string;
  email: string | null;
  candidateId: string;
}): Promise<WorkflowLearningCandidate> {
  await assertFlag(input.userId, input.email);
  const candidate = findCandidate(input.userId, input.candidateId);
  if (!candidate) {
    throw new WorkflowLearningError("候補が見つかりません", "not_found", 404);
  }
  assertOwner(input.userId, candidate.userId);
  if (candidate.status !== "candidate" && candidate.status !== "approved") {
    throw new WorkflowLearningError("この候補は承認できません", "conflict", 409);
  }
  const next = upsertCandidate({
    ...candidate,
    status: "approved",
    updatedAt: new Date().toISOString(),
  });
  recordWorkflowLearningAudit({
    userId: input.userId,
    action: "approve",
    automationId: candidate.automationId,
    candidateId: candidate.id,
    outcome: "ok",
  });
  schedulePersistWorkflowLearning(input.userId);
  return next;
}

export async function applyCandidate(input: {
  userId: string;
  email: string | null;
  candidateId: string;
  allowHighRiskExternal?: boolean;
  editedPatch?: WorkflowLearningCandidate["proposedPatch"];
  trial?: boolean;
}): Promise<{
  candidate: WorkflowLearningCandidate;
  revisionId: string;
  trialId?: string;
}> {
  await assertFlag(input.userId, input.email);
  await ensureAutomationsV2Hydrated(input.userId);

  const candidate = findCandidate(input.userId, input.candidateId);
  if (!candidate) {
    throw new WorkflowLearningError("候補が見つかりません", "not_found", 404);
  }
  assertOwner(input.userId, candidate.userId);

  if (candidate.deferToMemory && !input.editedPatch) {
    // Still allow apply of hint note, but surface that Memory is preferred
  }

  const patch = input.editedPatch ?? candidate.proposedPatch;
  if (touchesExternalSend(patch) && !input.allowHighRiskExternal) {
    throw new WorkflowLearningError(
      "外部送信条件の変更には追加確認が必要です",
      "high_risk",
      409,
    );
  }

  const automation = memoryGetAutomation(candidate.automationId);
  if (!automation || automation.userId !== input.userId) {
    throw new WorkflowLearningError("自動化が見つかりません", "not_found", 404);
  }
  if (automation.status === "archived") {
    throw new WorkflowLearningError(
      "アーカイブ済みの自動化には適用できません",
      "conflict",
      409,
    );
  }

  const step = automation.workflow.steps.find(
    (s) => patch.kind === "retry_policy" && s.id === patch.stepId,
  );
  if (
    patch.kind === "retry_policy" &&
    step &&
    isBlindRetryIncrease(step.retryPolicy.maxAttempts, patch)
  ) {
    throw new WorkflowLearningError(
      "retry回数を増やすだけの変更はできません",
      "invalid",
      400,
    );
  }

  const baseline = ensureBaselineRevision(automation, input.userId);
  const latest = getLatestRevision(automation.id) ?? baseline;

  const { next, changedFields } = applyPatchToAutomation(automation, patch, {
    allowHighRiskExternal: input.allowHighRiskExternal,
  });

  // Never overwrite without revision — update live definition after snapshot chain
  memoryUpdateAutomation(next);
  schedulePersistAutomationsV2(input.userId);

  const revision = createRevisionFromAutomation({
    automation: next,
    parent: latest,
    changeReason: candidate.summary,
    changeSource: input.trial ? "trial" : "workflow_learning",
    appliedCandidateIds: [candidate.id],
    changedFields,
    createdBy: input.userId,
    rollbackTarget: latest.id,
  });

  let trialId: string | undefined;
  if (input.trial) {
    const settings = readWorkflowLearningSettings(input.userId);
    if (!settings.allowTrial) {
      throw new WorkflowLearningError("Trialは無効です", "invalid", 400);
    }
    if (touchesExternalSend(patch)) {
      throw new WorkflowLearningError(
        "外部送信条件ではTrialできません",
        "high_risk",
        409,
      );
    }
    const runs = memoryListRunsForAutomation({
      userId: input.userId,
      automationId: automation.id,
    });
    const trial = upsertTrial({
      id: newId("wltrial"),
      userId: input.userId,
      automationId: automation.id,
      candidateId: candidate.id,
      baselineRevisionId: latest.id,
      trialRevisionId: revision.id,
      status: "active",
      baselineMetrics: computeMetricsFromRuns(runs),
      trialMetrics: null,
      autoRollbackOnFailure: settings.autoRollbackTrialOnRegression,
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
    trialId = trial.id;
  }

  const updatedCandidate = upsertCandidate({
    ...candidate,
    proposedPatch: patch,
    status: input.trial ? "trial" : "applied",
    appliedRevisionId: revision.id,
    updatedAt: new Date().toISOString(),
  });

  recordWorkflowLearningAudit({
    userId: input.userId,
    action: input.trial ? "trial_apply" : "apply",
    automationId: automation.id,
    candidateId: candidate.id,
    revisionId: revision.id,
    outcome: "ok",
    meta: { trial: Boolean(input.trial) },
  });
  schedulePersistWorkflowLearning(input.userId);

  return { candidate: updatedCandidate, revisionId: revision.id, trialId };
}

export async function rollbackAutomationRevision(input: {
  userId: string;
  email: string | null;
  automationId: string;
  targetRevisionId: string;
}): Promise<{ revisionId: string }> {
  await assertFlag(input.userId, input.email);
  await ensureAutomationsV2Hydrated(input.userId);

  const automation = memoryGetAutomation(input.automationId);
  if (!automation || automation.userId !== input.userId) {
    throw new WorkflowLearningError("自動化が見つかりません", "not_found", 404);
  }

  const target = resolveRollbackSnapshot(
    input.automationId,
    input.userId,
    input.targetRevisionId,
  );
  const latest = getLatestRevision(input.automationId);
  if (!latest) {
    throw new WorkflowLearningError("revisionがありません", "not_found", 404);
  }

  const restored = structuredClone(target.snapshot);
  restored.updatedAt = new Date().toISOString();
  memoryUpdateAutomation(restored);
  schedulePersistAutomationsV2(input.userId);

  const revision = createRevisionFromAutomation({
    automation: restored,
    parent: latest,
    changeReason: `Rollback to revision #${target.revisionNumber}`,
    changeSource: "rollback",
    appliedCandidateIds: [],
    changedFields: ["*"],
    createdBy: input.userId,
    rollbackTarget: target.id,
  });

  // Mark related applied candidates as rolled_back
  for (const c of listCandidates(input.userId, input.automationId)) {
    if (c.status === "applied" || c.status === "trial") {
      upsertCandidate({
        ...c,
        status: "rolled_back",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  const activeTrial = findActiveTrialForAutomation(
    input.userId,
    input.automationId,
  );
  if (activeTrial) {
    upsertTrial({
      ...activeTrial,
      status: "rolled_back",
      completedAt: new Date().toISOString(),
    });
  }

  recordWorkflowLearningAudit({
    userId: input.userId,
    action: "rollback",
    automationId: input.automationId,
    revisionId: revision.id,
    outcome: "ok",
    meta: { targetRevisionId: target.id },
  });
  schedulePersistWorkflowLearning(input.userId);
  return { revisionId: revision.id };
}

export async function completeTrialIfNeeded(input: {
  userId: string;
  email: string | null;
  automationId: string;
}): Promise<{
  trialId: string;
  comparison: MetricsComparison;
  rolledBack: boolean;
} | null> {
  await assertFlag(input.userId, input.email);
  await ensureAutomationRunsV2Hydrated(input.userId);

  const trial = findActiveTrialForAutomation(input.userId, input.automationId);
  if (!trial) return null;

  const runs = memoryListRunsForAutomation({
    userId: input.userId,
    automationId: input.automationId,
  });
  const afterRuns = runs.filter(
    (r) => (r.completedAt ?? r.createdAt) >= trial.createdAt,
  );
  if (afterRuns.length < 1) return null;

  const trialMetrics = computeMetricsFromRuns(afterRuns);
  const comparison = compareMetrics(trial.baselineMetrics, trialMetrics);
  let rolledBack = false;

  if (!comparison.improved && trial.autoRollbackOnFailure) {
    await rollbackAutomationRevision({
      userId: input.userId,
      email: input.email,
      automationId: input.automationId,
      targetRevisionId: trial.baselineRevisionId,
    });
    rolledBack = true;
    upsertTrial({
      ...trial,
      status: "rolled_back",
      trialMetrics,
      completedAt: new Date().toISOString(),
    });
  } else {
    upsertTrial({
      ...trial,
      status: comparison.improved ? "completed" : "failed",
      trialMetrics,
      completedAt: new Date().toISOString(),
    });
    const candidate = findCandidate(input.userId, trial.candidateId);
    if (candidate) {
      upsertCandidate({
        ...candidate,
        status: comparison.improved ? "applied" : "rolled_back",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  recordWorkflowLearningAudit({
    userId: input.userId,
    action: "trial_complete",
    automationId: input.automationId,
    candidateId: trial.candidateId,
    outcome: "ok",
    meta: { rolledBack, improved: comparison.improved },
  });
  schedulePersistWorkflowLearning(input.userId);
  return { trialId: trial.id, comparison, rolledBack };
}

export async function compareAutomationLearning(input: {
  userId: string;
  email: string | null;
  automationId: string;
  beforeRevisionId: string;
  afterRevisionId: string;
}): Promise<MetricsComparison> {
  await assertFlag(input.userId, input.email);
  await ensureAutomationRunsV2Hydrated(input.userId);

  const beforeRevision = resolveRollbackSnapshot(
    input.automationId,
    input.userId,
    input.beforeRevisionId,
  );
  const afterRevision = resolveRollbackSnapshot(
    input.automationId,
    input.userId,
    input.afterRevisionId,
  );

  const runs = memoryListRunsForAutomation({
    userId: input.userId,
    automationId: input.automationId,
  });
  const splitAt = afterRevision.createdAt;
  const beforeRuns = runs.filter(
    (r) => (r.completedAt ?? r.createdAt) < splitAt,
  );
  const afterRuns = runs.filter(
    (r) => (r.completedAt ?? r.createdAt) >= splitAt,
  );

  if (beforeRevision.userId !== input.userId) {
    throw new WorkflowLearningError("権限がありません", "forbidden", 403);
  }

  return compareMetrics(
    computeMetricsFromRuns(beforeRuns.length ? beforeRuns : runs),
    computeMetricsFromRuns(afterRuns.length ? afterRuns : runs),
  );
}

export async function listRevisionsForUser(input: {
  userId: string;
  email: string | null;
  automationId: string;
}) {
  await assertFlag(input.userId, input.email);
  const revs = listRevisions(input.automationId).filter(
    (r) => r.userId === input.userId,
  );
  return revs;
}

export async function listTrialsForUser(input: {
  userId: string;
  email: string | null;
}) {
  await assertFlag(input.userId, input.email);
  return listTrials(input.userId);
}

export async function getCandidateOrThrow(input: {
  userId: string;
  email: string | null;
  candidateId: string;
}): Promise<WorkflowLearningCandidate> {
  await assertFlag(input.userId, input.email);
  const c = findCandidate(input.userId, input.candidateId);
  if (!c || c.userId !== input.userId) {
    throw new WorkflowLearningError("候補が見つかりません", "not_found", 404);
  }
  return c;
}

export function getTrialOrThrow(userId: string, trialId: string) {
  const t = findTrial(userId, trialId);
  if (!t) {
    throw new WorkflowLearningError("Trialが見つかりません", "not_found", 404);
  }
  return t;
}

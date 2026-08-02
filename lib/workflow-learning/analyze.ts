import type { AutomationRun, AutomationV2 } from "@/lib/automation-platform/types";
import {
  classifyCorrectionText,
  groupSignalsByFingerprint,
  ruleForKind,
} from "@/lib/workflow-learning/patterns/corrections";
import { analyzeCostPatterns } from "@/lib/workflow-learning/patterns/cost";
import { analyzeFailurePatterns } from "@/lib/workflow-learning/patterns/failures";
import {
  fingerprintCandidate,
  fingerprintSignal,
  newId,
} from "@/lib/workflow-learning/fingerprint";
import {
  isBlockedExternalDocumentSource,
  sanitizeLearningText,
} from "@/lib/workflow-learning/security";
import {
  appendSignal,
  isSuppressed,
  listCandidates,
  listSignals,
  readWorkflowLearningSettings,
  upsertCandidate,
} from "@/lib/workflow-learning/store";
import type {
  CorrectionSignal,
  WorkflowLearningCandidate,
} from "@/lib/workflow-learning/types";

function expireOld(
  candidate: WorkflowLearningCandidate,
  ttlDays: number,
  now: Date,
): WorkflowLearningCandidate {
  if (candidate.status !== "candidate" && candidate.status !== "approved") {
    return candidate;
  }
  const ageMs = now.getTime() - new Date(candidate.createdAt).getTime();
  if (ageMs > ttlDays * 86_400_000) {
    return {
      ...candidate,
      status: "expired",
      updatedAt: now.toISOString(),
    };
  }
  if (candidate.expiresAt && new Date(candidate.expiresAt).getTime() < now.getTime()) {
    return {
      ...candidate,
      status: "expired",
      updatedAt: now.toISOString(),
    };
  }
  return candidate;
}

function upsertUniqueCandidate(
  draft: WorkflowLearningCandidate,
): WorkflowLearningCandidate {
  const existing = listCandidates(draft.userId, draft.automationId).find(
    (c) => c.fingerprint === draft.fingerprint,
  );
  if (existing) {
    if (
      existing.status === "rejected" ||
      existing.status === "suppressed" ||
      existing.status === "applied"
    ) {
      return existing;
    }
    return upsertCandidate({
      ...existing,
      sourceRunIds: [
        ...new Set([...existing.sourceRunIds, ...draft.sourceRunIds]),
      ],
      evidence: [...existing.evidence, ...draft.evidence].slice(0, 12),
      confidence: Math.max(existing.confidence, draft.confidence),
      updatedAt: draft.updatedAt,
    });
  }
  return upsertCandidate(draft);
}

export function recordCorrection(input: {
  userId: string;
  automationId: string;
  text: string;
  runId?: string | null;
  source?: string | null;
}): CorrectionSignal | null {
  if (isBlockedExternalDocumentSource(input.source)) {
    return null;
  }
  const classified = classifyCorrectionText(input.text);
  if (!classified) return null;
  const text = sanitizeLearningText(input.text);
  const fingerprint = fingerprintSignal({
    automationId: input.automationId,
    kind: classified.kind,
    text,
  });
  return appendSignal({
    id: newId("wlsig"),
    userId: input.userId,
    automationId: input.automationId,
    kind: classified.kind,
    fingerprint,
    text,
    runId: input.runId ?? null,
    createdAt: new Date().toISOString(),
    isPreference: classified.isPreference,
  });
}

export function analyzeAutomationLearning(input: {
  userId: string;
  automation: AutomationV2;
  runs: AutomationRun[];
  now?: Date;
}): WorkflowLearningCandidate[] {
  const now = input.now ?? new Date();
  const settings = readWorkflowLearningSettings(input.userId);
  if (!settings.enabled) {
    return listCandidates(input.userId, input.automation.id);
  }

  const thresholds = settings.thresholds;

  for (const c of listCandidates(input.userId, input.automation.id)) {
    const next = expireOld(c, thresholds.candidateTtlDays, now);
    if (next.status !== c.status) upsertCandidate(next);
  }

  const signals = listSignals(input.userId, input.automation.id);
  const grouped = groupSignalsByFingerprint(signals);
  for (const [fp, group] of grouped) {
    if (isSuppressed(input.userId, fp)) continue;
    const kind = group[0]?.kind;
    if (!kind) continue;
    const rule = ruleForKind(kind);
    if (!rule) continue;
    const threshold = Number(thresholds[rule.thresholdKey]);
    if (group.length < threshold) continue;

    let patch = rule.buildPatch(group);
    if (kind === "step_order" && input.automation.workflow.steps.length >= 2) {
      const ids = [...input.automation.workflow.steps]
        .sort((a, b) => b.order - a.order)
        .map((s) => s.id);
      patch = { kind: "step_order", stepIds: ids };
    }
    if (kind === "step_disable") {
      const stepId = input.automation.workflow.steps.find((s) => s.enabled)?.id;
      if (stepId) {
        patch = { kind: "step_enabled", stepId, enabled: false };
      }
    }
    if (!patch) continue;

    const type = rule.candidateType;
    const fingerprint = fingerprintCandidate({
      automationId: input.automation.id,
      type,
      patch,
    });
    if (isSuppressed(input.userId, fingerprint)) continue;

    const draft: WorkflowLearningCandidate = {
      id: newId("wlc"),
      userId: input.userId,
      automationId: input.automation.id,
      sourceRunIds: group
        .map((g) => g.runId)
        .filter((id): id is string => Boolean(id)),
      type,
      summary: rule.summary(group.length),
      reason: rule.reason(group.length),
      evidence: group.slice(0, 5).map((g) => ({
        kind: "correction" as const,
        label: g.text,
        runId: g.runId ?? undefined,
      })),
      proposedPatch: patch,
      expectedBenefit: {
        timeReduction: 0.05,
        costReduction: 0,
        failureReduction: 0,
        manualStepReduction: Math.min(0.8, group.length * 0.15),
      },
      riskLevel: group[0]?.isPreference ? "low" : "medium",
      confidence: Math.min(0.95, 0.45 + group.length * 0.1),
      status: "candidate",
      fingerprint,
      deferToMemory: Boolean(group[0]?.isPreference),
      trialOnly: false,
      expiresAt: new Date(
        now.getTime() + thresholds.candidateTtlDays * 86_400_000,
      ).toISOString(),
      appliedRevisionId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    if (draft.confidence < thresholds.minConfidence) continue;
    upsertUniqueCandidate(draft);
  }

  const failureHits = [
    ...analyzeFailurePatterns(input.runs, thresholds),
    ...analyzeCostPatterns(input.runs),
  ];
  for (const hit of failureHits) {
    const fingerprint = fingerprintCandidate({
      automationId: input.automation.id,
      type: hit.type,
      patch: hit.proposedPatch,
    });
    if (isSuppressed(input.userId, fingerprint)) continue;
    if (hit.confidence < thresholds.minConfidence) continue;
    upsertUniqueCandidate({
      id: newId("wlc"),
      userId: input.userId,
      automationId: input.automation.id,
      sourceRunIds: hit.sourceRunIds,
      type: hit.type,
      summary: hit.summary,
      reason: hit.reason,
      evidence: hit.evidence,
      proposedPatch: hit.proposedPatch,
      expectedBenefit: hit.expectedBenefit,
      riskLevel: hit.riskLevel,
      confidence: hit.confidence,
      status: "candidate",
      fingerprint,
      deferToMemory: false,
      trialOnly: false,
      expiresAt: new Date(
        now.getTime() + thresholds.candidateTtlDays * 86_400_000,
      ).toISOString(),
      appliedRevisionId: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  return listCandidates(input.userId, input.automation.id);
}

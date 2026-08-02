import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import {
  listAllRevisionsForUser,
  listAuditForUser,
  listCandidates,
  listSignals,
  listSuppressed,
  listTrials,
  readWorkflowLearningSettings,
  replaceAuditForUser,
  replaceCandidates,
  replaceRevisionsForUser,
  replaceSignals,
  replaceSuppressed,
  replaceTrials,
  writeWorkflowLearningSettings,
} from "@/lib/workflow-learning/store";
import type {
  AutomationRevision,
  CorrectionSignal,
  TrialRecord,
  WorkflowLearningAuditEntry,
  WorkflowLearningCandidate,
  WorkflowLearningSettings,
} from "@/lib/workflow-learning/types";

export const WORKFLOW_LEARNING_DOMAIN_KEY = "atlasWorkflowLearning";

export type DurableWorkflowLearningState = {
  candidates: WorkflowLearningCandidate[];
  revisions: AutomationRevision[];
  signals: CorrectionSignal[];
  trials: TrialRecord[];
  settings: WorkflowLearningSettings;
  suppressedFingerprints: string[];
  audit: WorkflowLearningAuditEntry[];
};

type HydrationFlags = Set<string>;

function getHydrated(): HydrationFlags {
  const g = globalThis as typeof globalThis & {
    __atlasWorkflowLearningHydrated?: HydrationFlags;
  };
  if (!g.__atlasWorkflowLearningHydrated) {
    g.__atlasWorkflowLearningHydrated = new Set();
  }
  return g.__atlasWorkflowLearningHydrated;
}

export function resetWorkflowLearningDurableForTests(): void {
  getHydrated().clear();
}

function snapshot(userId: string): DurableWorkflowLearningState {
  return {
    candidates: listCandidates(userId),
    revisions: listAllRevisionsForUser(userId),
    signals: listSignals(userId),
    trials: listTrials(userId),
    settings: readWorkflowLearningSettings(userId),
    suppressedFingerprints: listSuppressed(userId),
    audit: listAuditForUser(userId),
  };
}

function compact(state: DurableWorkflowLearningState): DurableWorkflowLearningState {
  return {
    settings: state.settings,
    suppressedFingerprints: state.suppressedFingerprints.slice(-300),
    signals: state.signals.slice(0, 300),
    trials: state.trials.slice(0, 100),
    audit: state.audit.slice(-200),
    candidates: state.candidates.slice(0, 200).map((c) => ({
      ...c,
      summary: c.summary.slice(0, 280),
      reason: c.reason.slice(0, 280),
      evidence: c.evidence.slice(0, 8),
    })),
    revisions: state.revisions.slice(0, 120),
  };
}

export function schedulePersistWorkflowLearning(userId: string): void {
  void persistDurableDomain(userId, WORKFLOW_LEARNING_DOMAIN_KEY, snapshot(userId), {
    compact,
    forceSupabase: true,
  });
}

export async function ensureWorkflowLearningHydrated(userId: string): Promise<void> {
  const hydrated = getHydrated();
  if (hydrated.has(userId)) return;
  hydrated.add(userId);

  if (listCandidates(userId).length > 0 || listSignals(userId).length > 0) return;

  const loaded = await loadDurableDomain<DurableWorkflowLearningState>(
    userId,
    WORKFLOW_LEARNING_DOMAIN_KEY,
  );
  if (!loaded) return;

  if (Array.isArray(loaded.candidates)) {
    replaceCandidates(userId, loaded.candidates.filter((c) => c.userId === userId));
  }
  if (Array.isArray(loaded.revisions)) {
    replaceRevisionsForUser(
      userId,
      loaded.revisions.filter((r) => r.userId === userId),
    );
  }
  if (Array.isArray(loaded.signals)) {
    replaceSignals(userId, loaded.signals.filter((s) => s.userId === userId));
  }
  if (Array.isArray(loaded.trials)) {
    replaceTrials(userId, loaded.trials.filter((t) => t.userId === userId));
  }
  if (loaded.settings) {
    writeWorkflowLearningSettings(userId, loaded.settings);
  }
  if (Array.isArray(loaded.suppressedFingerprints)) {
    replaceSuppressed(userId, loaded.suppressedFingerprints);
  }
  if (Array.isArray(loaded.audit)) {
    replaceAuditForUser(
      userId,
      loaded.audit.filter((a) => a.userId === userId),
    );
  }
}

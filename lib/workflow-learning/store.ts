import {
  DEFAULT_WORKFLOW_LEARNING_SETTINGS,
  type AutomationRevision,
  type CorrectionSignal,
  type TrialRecord,
  type WorkflowLearningAuditEntry,
  type WorkflowLearningCandidate,
  type WorkflowLearningSettings,
} from "@/lib/workflow-learning/types";

type Store = {
  candidates: Map<string, WorkflowLearningCandidate[]>;
  revisions: Map<string, AutomationRevision[]>; // key automationId
  signals: Map<string, CorrectionSignal[]>; // key userId
  trials: Map<string, TrialRecord[]>; // key userId
  settings: Map<string, WorkflowLearningSettings>;
  suppressedFingerprints: Map<string, Set<string>>; // userId -> fingerprints
  audit: WorkflowLearningAuditEntry[];
};

function getStore(): Store {
  const g = globalThis as typeof globalThis & {
    __atlasWorkflowLearningStore?: Store;
  };
  if (!g.__atlasWorkflowLearningStore) {
    g.__atlasWorkflowLearningStore = {
      candidates: new Map(),
      revisions: new Map(),
      signals: new Map(),
      trials: new Map(),
      settings: new Map(),
      suppressedFingerprints: new Map(),
      audit: [],
    };
  }
  return g.__atlasWorkflowLearningStore;
}

export function resetWorkflowLearningStoreForTests(): void {
  const store = getStore();
  store.candidates.clear();
  store.revisions.clear();
  store.signals.clear();
  store.trials.clear();
  store.settings.clear();
  store.suppressedFingerprints.clear();
  store.audit.length = 0;
}

export function readWorkflowLearningSettings(
  userId: string,
): WorkflowLearningSettings {
  return structuredClone(
    getStore().settings.get(userId) ?? DEFAULT_WORKFLOW_LEARNING_SETTINGS,
  );
}

export function writeWorkflowLearningSettings(
  userId: string,
  settings: WorkflowLearningSettings,
): WorkflowLearningSettings {
  const next = structuredClone(settings);
  getStore().settings.set(userId, next);
  return structuredClone(next);
}

export function listCandidates(
  userId: string,
  automationId?: string,
): WorkflowLearningCandidate[] {
  return (getStore().candidates.get(userId) ?? [])
    .filter((c) => (automationId ? c.automationId === automationId : true))
    .map((c) => structuredClone(c))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function findCandidate(
  userId: string,
  id: string,
): WorkflowLearningCandidate | null {
  const found = (getStore().candidates.get(userId) ?? []).find((c) => c.id === id);
  return found ? structuredClone(found) : null;
}

export function upsertCandidate(
  record: WorkflowLearningCandidate,
): WorkflowLearningCandidate {
  const store = getStore();
  const list = store.candidates.get(record.userId) ?? [];
  const index = list.findIndex((c) => c.id === record.id);
  if (index >= 0) list[index] = structuredClone(record);
  else list.unshift(structuredClone(record));
  store.candidates.set(record.userId, list);
  return structuredClone(record);
}

export function replaceCandidates(
  userId: string,
  records: WorkflowLearningCandidate[],
): void {
  getStore().candidates.set(
    userId,
    records.map((r) => structuredClone(r)),
  );
}

export function listRevisions(automationId: string): AutomationRevision[] {
  return (getStore().revisions.get(automationId) ?? [])
    .map((r) => structuredClone(r))
    .sort((a, b) => b.revisionNumber - a.revisionNumber);
}

export function findRevision(
  automationId: string,
  revisionId: string,
): AutomationRevision | null {
  const found = (getStore().revisions.get(automationId) ?? []).find(
    (r) => r.id === revisionId,
  );
  return found ? structuredClone(found) : null;
}

export function insertRevision(record: AutomationRevision): AutomationRevision {
  const store = getStore();
  const list = store.revisions.get(record.automationId) ?? [];
  list.push(structuredClone(record));
  store.revisions.set(record.automationId, list);
  return structuredClone(record);
}

export function replaceRevisionsForUser(
  userId: string,
  revisions: AutomationRevision[],
): void {
  const store = getStore();
  const byAuto = new Map<string, AutomationRevision[]>();
  for (const rev of revisions) {
    if (rev.userId !== userId) continue;
    const list = byAuto.get(rev.automationId) ?? [];
    list.push(structuredClone(rev));
    byAuto.set(rev.automationId, list);
  }
  for (const [automationId, list] of byAuto) {
    store.revisions.set(automationId, list);
  }
}

export function listAllRevisionsForUser(userId: string): AutomationRevision[] {
  const store = getStore();
  const out: AutomationRevision[] = [];
  for (const list of store.revisions.values()) {
    for (const rev of list) {
      if (rev.userId === userId) out.push(structuredClone(rev));
    }
  }
  return out;
}

export function appendSignal(signal: CorrectionSignal): CorrectionSignal {
  const store = getStore();
  const list = store.signals.get(signal.userId) ?? [];
  list.unshift(structuredClone(signal));
  store.signals.set(signal.userId, list.slice(0, 500));
  return structuredClone(signal);
}

export function listSignals(
  userId: string,
  automationId?: string,
): CorrectionSignal[] {
  return (getStore().signals.get(userId) ?? [])
    .filter((s) => (automationId ? s.automationId === automationId : true))
    .map((s) => structuredClone(s));
}

export function replaceSignals(userId: string, signals: CorrectionSignal[]): void {
  getStore().signals.set(
    userId,
    signals.map((s) => structuredClone(s)),
  );
}

export function isSuppressed(userId: string, fingerprint: string): boolean {
  return getStore().suppressedFingerprints.get(userId)?.has(fingerprint) ?? false;
}

export function suppressFingerprint(userId: string, fingerprint: string): void {
  const store = getStore();
  const set = store.suppressedFingerprints.get(userId) ?? new Set();
  set.add(fingerprint);
  store.suppressedFingerprints.set(userId, set);
}

export function listSuppressed(userId: string): string[] {
  return [...(getStore().suppressedFingerprints.get(userId) ?? [])];
}

export function replaceSuppressed(userId: string, fingerprints: string[]): void {
  getStore().suppressedFingerprints.set(userId, new Set(fingerprints));
}

export function upsertTrial(trial: TrialRecord): TrialRecord {
  const store = getStore();
  const list = store.trials.get(trial.userId) ?? [];
  const index = list.findIndex((t) => t.id === trial.id);
  if (index >= 0) list[index] = structuredClone(trial);
  else list.unshift(structuredClone(trial));
  store.trials.set(trial.userId, list);
  return structuredClone(trial);
}

export function listTrials(userId: string): TrialRecord[] {
  return (getStore().trials.get(userId) ?? []).map((t) => structuredClone(t));
}

export function findTrial(userId: string, id: string): TrialRecord | null {
  const found = (getStore().trials.get(userId) ?? []).find((t) => t.id === id);
  return found ? structuredClone(found) : null;
}

export function findActiveTrialForAutomation(
  userId: string,
  automationId: string,
): TrialRecord | null {
  const found = (getStore().trials.get(userId) ?? []).find(
    (t) => t.automationId === automationId && t.status === "active",
  );
  return found ? structuredClone(found) : null;
}

export function replaceTrials(userId: string, trials: TrialRecord[]): void {
  getStore().trials.set(
    userId,
    trials.map((t) => structuredClone(t)),
  );
}

export function appendAudit(entry: WorkflowLearningAuditEntry): void {
  const store = getStore();
  store.audit.push(structuredClone(entry));
  if (store.audit.length > 1000) store.audit.splice(0, store.audit.length - 1000);
}

export function listAuditForUser(userId: string): WorkflowLearningAuditEntry[] {
  return getStore()
    .audit.filter((e) => e.userId === userId)
    .map((e) => structuredClone(e));
}

export function replaceAuditForUser(
  userId: string,
  entries: WorkflowLearningAuditEntry[],
): void {
  const store = getStore();
  store.audit = [
    ...store.audit.filter((e) => e.userId !== userId),
    ...entries.map((e) => structuredClone(e)),
  ];
}

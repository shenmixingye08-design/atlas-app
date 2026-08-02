import type {
  AutomationRun,
  AutomationV2,
} from "@/lib/automation-platform/types";

type Store = {
  automations: Map<string, AutomationV2>;
  runs: Map<string, AutomationRun>;
  /** Unique indexes */
  occurrenceKeys: Map<string, string>; // occurrenceKey -> runId
  idempotencyKeys: Map<string, string>; // idempotencyKey -> runId
  legacyMap: Map<string, string>; // legacyId -> v2Id
};

function getStore(): Store {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAutomationPlatformStore?: Store;
  };
  if (!globalScope.__atlasAutomationPlatformStore) {
    globalScope.__atlasAutomationPlatformStore = {
      automations: new Map(),
      runs: new Map(),
      occurrenceKeys: new Map(),
      idempotencyKeys: new Map(),
      legacyMap: new Map(),
    };
  }
  return globalScope.__atlasAutomationPlatformStore;
}

export function resetAutomationPlatformStoreForTests(): void {
  const store = getStore();
  store.automations.clear();
  store.runs.clear();
  store.occurrenceKeys.clear();
  store.idempotencyKeys.clear();
  store.legacyMap.clear();
}

export function memoryInsertAutomation(record: AutomationV2): AutomationV2 {
  const store = getStore();
  store.automations.set(record.id, structuredClone(record));
  if (record.legacyAutomationId) {
    store.legacyMap.set(record.legacyAutomationId, record.id);
  }
  return structuredClone(record);
}

export function memoryUpdateAutomation(record: AutomationV2): AutomationV2 {
  const store = getStore();
  store.automations.set(record.id, structuredClone(record));
  return structuredClone(record);
}

export function memoryGetAutomation(id: string): AutomationV2 | null {
  const record = getStore().automations.get(id);
  return record ? structuredClone(record) : null;
}

export function memoryListAutomationsForUser(userId: string): AutomationV2[] {
  return [...getStore().automations.values()]
    .filter((item) => item.userId === userId)
    .map((item) => structuredClone(item))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** System/cron: all automations currently resident in the process store. */
export function memoryListAllAutomations(): AutomationV2[] {
  return [...getStore().automations.values()]
    .map((item) => structuredClone(item))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Active scheduled automations whose nextRunAt is due at or before `nowMs`. */
export function memoryListDueActiveAutomations(
  nowMs: number = Date.now(),
  limit = 50,
): AutomationV2[] {
  return memoryListAllAutomations()
    .filter((item) => {
      if (item.status !== "active") return false;
      if (item.trigger.type !== "schedule") return false;
      if (!item.nextRunAt) return false;
      const t = Date.parse(item.nextRunAt);
      return Number.isFinite(t) && t <= nowMs;
    })
    .sort(
      (a, b) =>
        Date.parse(a.nextRunAt ?? "") - Date.parse(b.nextRunAt ?? ""),
    )
    .slice(0, limit);
}

export function memoryFindByLegacyId(legacyId: string): AutomationV2 | null {
  const store = getStore();
  const id = store.legacyMap.get(legacyId);
  if (!id) return null;
  return memoryGetAutomation(id);
}

export function memoryInsertRun(run: AutomationRun): {
  run: AutomationRun;
  created: boolean;
} {
  const store = getStore();

  if (store.idempotencyKeys.has(run.idempotencyKey)) {
    const existingId = store.idempotencyKeys.get(run.idempotencyKey)!;
    return { run: structuredClone(store.runs.get(existingId)!), created: false };
  }

  if (
    run.scheduleOccurrenceKey &&
    store.occurrenceKeys.has(run.scheduleOccurrenceKey)
  ) {
    const existingId = store.occurrenceKeys.get(run.scheduleOccurrenceKey)!;
    return { run: structuredClone(store.runs.get(existingId)!), created: false };
  }

  store.runs.set(run.id, structuredClone(run));
  store.idempotencyKeys.set(run.idempotencyKey, run.id);
  if (run.scheduleOccurrenceKey) {
    store.occurrenceKeys.set(run.scheduleOccurrenceKey, run.id);
  }
  return { run: structuredClone(run), created: true };
}

/** Hydration / force restore — bypasses idempotency (record already owned). */
export function memoryRestoreRun(run: AutomationRun): AutomationRun {
  const store = getStore();
  store.runs.set(run.id, structuredClone(run));
  store.idempotencyKeys.set(run.idempotencyKey, run.id);
  if (run.scheduleOccurrenceKey) {
    store.occurrenceKeys.set(run.scheduleOccurrenceKey, run.id);
  }
  return structuredClone(run);
}

export function memoryUpdateRun(run: AutomationRun): AutomationRun {
  const store = getStore();
  const existing = store.runs.get(run.id);
  if (!existing) {
    store.runs.set(run.id, structuredClone(run));
    return structuredClone(run);
  }
  // Tamper guard: immutable identity fields
  if (
    existing.userId !== run.userId ||
    existing.automationId !== run.automationId ||
    existing.runKey !== run.runKey ||
    existing.idempotencyKey !== run.idempotencyKey
  ) {
    throw new Error("Run identity fields are immutable");
  }
  store.runs.set(run.id, structuredClone(run));
  return structuredClone(run);
}

/**
 * Claim a queued/retrying run for execution. Returns null if already claimed
 * or not in a claimable state (prevents double execution).
 */
export function memoryClaimRun(runId: string): AutomationRun | null {
  const store = getStore();
  const current = store.runs.get(runId);
  if (!current) return null;
  if (current.status !== "queued" && current.status !== "retrying") {
    return null;
  }
  if (
    current.status === "retrying" &&
    current.nextRetryAt &&
    Date.parse(current.nextRetryAt) > Date.now()
  ) {
    return null;
  }
  const now = new Date().toISOString();
  const claimed: AutomationRun = {
    ...current,
    status: "running",
    startedAt: current.startedAt ?? now,
    updatedAt: now,
  };
  store.runs.set(runId, structuredClone(claimed));
  return structuredClone(claimed);
}

export function memoryGetRun(id: string): AutomationRun | null {
  const run = getStore().runs.get(id);
  return run ? structuredClone(run) : null;
}

export function memoryListRunsForAutomation(input: {
  userId: string;
  automationId: string;
}): AutomationRun[] {
  return [...getStore().runs.values()]
    .filter(
      (run) =>
        run.userId === input.userId && run.automationId === input.automationId,
    )
    .map((run) => structuredClone(run))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function memoryListRunsForUser(userId: string): AutomationRun[] {
  return [...getStore().runs.values()]
    .filter((run) => run.userId === userId)
    .map((run) => structuredClone(run))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Queued runs + due retries ready for the worker. */
export function memoryListDispatchableRuns(limit = 20): AutomationRun[] {
  const now = Date.now();
  return [...getStore().runs.values()]
    .filter((run) => {
      if (run.status === "queued") return true;
      if (run.status !== "retrying") return false;
      if (!run.nextRetryAt) return true;
      return Date.parse(run.nextRetryAt) <= now;
    })
    .sort((a, b) => (a.queuedAt ?? a.createdAt).localeCompare(b.queuedAt ?? b.createdAt))
    .slice(0, limit)
    .map((run) => structuredClone(run));
}

export function memoryGetRunByOccurrenceKey(
  occurrenceKey: string,
): AutomationRun | null {
  const store = getStore();
  const id = store.occurrenceKeys.get(occurrenceKey);
  if (!id) return null;
  return memoryGetRun(id);
}

/** Test/harness helper: drop a run from memory without touching automations. */
export function memoryDeleteRunForTests(runId: string): void {
  const store = getStore();
  const run = store.runs.get(runId);
  if (!run) return;
  store.runs.delete(runId);
  if (store.idempotencyKeys.get(run.idempotencyKey) === runId) {
    store.idempotencyKeys.delete(run.idempotencyKey);
  }
  if (
    run.scheduleOccurrenceKey &&
    store.occurrenceKeys.get(run.scheduleOccurrenceKey) === runId
  ) {
    store.occurrenceKeys.delete(run.scheduleOccurrenceKey);
  }
}

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

export function memoryUpdateRun(run: AutomationRun): AutomationRun {
  getStore().runs.set(run.id, structuredClone(run));
  return structuredClone(run);
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

export function memoryGetRunByOccurrenceKey(
  occurrenceKey: string,
): AutomationRun | null {
  const store = getStore();
  const id = store.occurrenceKeys.get(occurrenceKey);
  if (!id) return null;
  return memoryGetRun(id);
}

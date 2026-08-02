import type {
  GenerationApplicationRecord,
  PredictionRecord,
  ProductionMemoryRecord,
} from "@/lib/personalization/types";

type Store = {
  memories: Map<string, ProductionMemoryRecord[]>;
  generations: Map<string, GenerationApplicationRecord[]>;
  predictions: Map<string, PredictionRecord[]>;
  sessionDisabled: Set<string>;
};

function getStore(): Store {
  const globalScope = globalThis as typeof globalThis & {
    __atlasProductionMemoryStore?: Store;
  };
  if (!globalScope.__atlasProductionMemoryStore) {
    globalScope.__atlasProductionMemoryStore = {
      memories: new Map(),
      generations: new Map(),
      predictions: new Map(),
      sessionDisabled: new Set(),
    };
  }
  return globalScope.__atlasProductionMemoryStore;
}

export function resetProductionMemoryStoreForTests(): void {
  const store = getStore();
  store.memories.clear();
  store.generations.clear();
  store.predictions.clear();
  store.sessionDisabled.clear();
}

export function isSessionMemoryDisabled(ownerId: string): boolean {
  return getStore().sessionDisabled.has(ownerId);
}

export function setSessionMemoryDisabled(
  ownerId: string,
  disabled: boolean,
): void {
  if (disabled) getStore().sessionDisabled.add(ownerId);
  else getStore().sessionDisabled.delete(ownerId);
}

export function listProductionMemories(
  ownerId: string,
): ProductionMemoryRecord[] {
  return (getStore().memories.get(ownerId) ?? []).map((row) =>
    structuredClone(row),
  );
}

export function findProductionMemory(
  ownerId: string,
  memoryId: string,
): ProductionMemoryRecord | null {
  const found = (getStore().memories.get(ownerId) ?? []).find(
    (m) => m.memoryId === memoryId,
  );
  return found ? structuredClone(found) : null;
}

export function upsertProductionMemory(
  record: ProductionMemoryRecord,
): ProductionMemoryRecord {
  const store = getStore();
  const list = store.memories.get(record.ownerId) ?? [];
  const index = list.findIndex((m) => m.memoryId === record.memoryId);
  if (index >= 0) list[index] = structuredClone(record);
  else list.unshift(structuredClone(record));
  store.memories.set(record.ownerId, list);
  return structuredClone(record);
}

export function replaceProductionMemories(
  ownerId: string,
  records: ProductionMemoryRecord[],
): void {
  getStore().memories.set(
    ownerId,
    records.map((row) => structuredClone(row)),
  );
}

export function appendGenerationRecord(
  record: GenerationApplicationRecord,
): void {
  const store = getStore();
  const list = store.generations.get(record.ownerId) ?? [];
  list.unshift(structuredClone(record));
  store.generations.set(record.ownerId, list.slice(0, 500));
}

export function listGenerationRecords(
  ownerId: string,
): GenerationApplicationRecord[] {
  return (getStore().generations.get(ownerId) ?? []).map((row) =>
    structuredClone(row),
  );
}

export function appendPredictionRecord(record: PredictionRecord): void {
  const store = getStore();
  const list = store.predictions.get(record.ownerId) ?? [];
  list.unshift(structuredClone(record));
  store.predictions.set(record.ownerId, list.slice(0, 200));
}

export function listPredictionRecords(ownerId: string): PredictionRecord[] {
  return (getStore().predictions.get(ownerId) ?? []).map((row) =>
    structuredClone(row),
  );
}

export function snapshotProductionMemory(ownerId: string): {
  memories: ProductionMemoryRecord[];
  generations: GenerationApplicationRecord[];
  predictions: PredictionRecord[];
} {
  return {
    memories: listProductionMemories(ownerId),
    generations: listGenerationRecords(ownerId),
    predictions: listPredictionRecords(ownerId),
  };
}

export function restoreProductionMemorySnapshot(
  ownerId: string,
  snapshot: {
    memories?: ProductionMemoryRecord[];
    generations?: GenerationApplicationRecord[];
    predictions?: PredictionRecord[];
  },
): void {
  replaceProductionMemories(ownerId, snapshot.memories ?? []);
  getStore().generations.set(
    ownerId,
    (snapshot.generations ?? []).map((row) => structuredClone(row)),
  );
  getStore().predictions.set(
    ownerId,
    (snapshot.predictions ?? []).map((row) => structuredClone(row)),
  );
}

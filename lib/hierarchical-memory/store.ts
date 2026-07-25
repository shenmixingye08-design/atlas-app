import type { HierarchicalMemoryRecord } from "./types";

type GlobalScope = typeof globalThis & {
  __atlasHierarchicalMemoryStore?: Map<string, HierarchicalMemoryRecord[]>;
  __atlasHierarchicalMemoryHydrated?: Set<string>;
};

function buckets(): Map<string, HierarchicalMemoryRecord[]> {
  const scope = globalThis as GlobalScope;
  if (!scope.__atlasHierarchicalMemoryStore) {
    scope.__atlasHierarchicalMemoryStore = new Map();
  }
  return scope.__atlasHierarchicalMemoryStore;
}

function hydrated(): Set<string> {
  const scope = globalThis as GlobalScope;
  if (!scope.__atlasHierarchicalMemoryHydrated) {
    scope.__atlasHierarchicalMemoryHydrated = new Set();
  }
  return scope.__atlasHierarchicalMemoryHydrated;
}

export function listStoredHierarchicalMemories(
  userId: string,
): HierarchicalMemoryRecord[] {
  return [...(buckets().get(userId) ?? [])];
}

export function replaceStoredHierarchicalMemories(
  userId: string,
  memories: HierarchicalMemoryRecord[],
): void {
  buckets().set(userId, memories);
}

export function upsertStoredHierarchicalMemory(
  record: HierarchicalMemoryRecord,
): void {
  const current = listStoredHierarchicalMemories(record.userId);
  const next = current.filter((item) => item.id !== record.id);
  next.unshift(record);
  replaceStoredHierarchicalMemories(record.userId, next);
}

export function isHierarchicalMemoryHydrated(userId: string): boolean {
  return hydrated().has(userId);
}

export function markHierarchicalMemoryHydrated(userId: string): void {
  hydrated().add(userId);
}

export function resetHierarchicalMemoryStoreForTests(): void {
  buckets().clear();
  hydrated().clear();
}

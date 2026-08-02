import type {
  PersonalMemoryRecord,
  PersonalMemorySettings,
} from "@/lib/personal-memory/types";
import { DEFAULT_PERSONAL_MEMORY_SETTINGS } from "@/lib/personal-memory/types";

type CorrectionCounter = {
  fingerprint: string;
  count: number;
  lastSeenAt: string;
  scopeHint: string | null;
  automationId: string | null;
};

type Store = {
  memories: Map<string, PersonalMemoryRecord[]>;
  settings: Map<string, PersonalMemorySettings>;
  correctionCounters: Map<string, CorrectionCounter[]>;
  rejectedFingerprints: Map<string, Set<string>>;
};

function getStore(): Store {
  const globalScope = globalThis as typeof globalThis & {
    __atlasPersonalMemoryStore?: Store;
  };
  if (!globalScope.__atlasPersonalMemoryStore) {
    globalScope.__atlasPersonalMemoryStore = {
      memories: new Map(),
      settings: new Map(),
      correctionCounters: new Map(),
      rejectedFingerprints: new Map(),
    };
  }
  return globalScope.__atlasPersonalMemoryStore;
}

export function resetPersonalMemoryStoreForTests(): void {
  const store = getStore();
  store.memories.clear();
  store.settings.clear();
  store.correctionCounters.clear();
  store.rejectedFingerprints.clear();
}

export function listStoredPersonalMemories(
  userId: string,
): PersonalMemoryRecord[] {
  return (getStore().memories.get(userId) ?? []).map((row) =>
    structuredClone(row),
  );
}

export function findStoredPersonalMemory(
  userId: string,
  id: string,
): PersonalMemoryRecord | null {
  const found = (getStore().memories.get(userId) ?? []).find((m) => m.id === id);
  return found ? structuredClone(found) : null;
}

export function upsertStoredPersonalMemory(
  record: PersonalMemoryRecord,
): PersonalMemoryRecord {
  const store = getStore();
  const list = store.memories.get(record.userId) ?? [];
  const index = list.findIndex((m) => m.id === record.id);
  if (index >= 0) {
    list[index] = structuredClone(record);
  } else {
    list.unshift(structuredClone(record));
  }
  store.memories.set(record.userId, list);
  return structuredClone(record);
}

export function replaceStoredPersonalMemories(
  userId: string,
  records: PersonalMemoryRecord[],
): void {
  getStore().memories.set(
    userId,
    records.map((row) => structuredClone(row)),
  );
}

export function deleteStoredPersonalMemory(
  userId: string,
  id: string,
): boolean {
  const store = getStore();
  const list = store.memories.get(userId) ?? [];
  const next = list.filter((m) => m.id !== id);
  if (next.length === list.length) return false;
  store.memories.set(userId, next);
  return true;
}

export function readPersonalMemorySettings(
  userId: string,
): PersonalMemorySettings {
  return structuredClone(
    getStore().settings.get(userId) ?? DEFAULT_PERSONAL_MEMORY_SETTINGS,
  );
}

export function writePersonalMemorySettings(
  userId: string,
  settings: PersonalMemorySettings,
): PersonalMemorySettings {
  const next = { ...DEFAULT_PERSONAL_MEMORY_SETTINGS, ...settings };
  getStore().settings.set(userId, structuredClone(next));
  return structuredClone(next);
}

export function bumpCorrectionCounter(input: {
  userId: string;
  fingerprint: string;
  scopeHint?: string | null;
  automationId?: string | null;
}): number {
  const store = getStore();
  const list = store.correctionCounters.get(input.userId) ?? [];
  const existing = list.find((row) => row.fingerprint === input.fingerprint);
  const now = new Date().toISOString();
  if (existing) {
    existing.count += 1;
    existing.lastSeenAt = now;
    existing.scopeHint = input.scopeHint ?? existing.scopeHint;
    existing.automationId = input.automationId ?? existing.automationId;
    store.correctionCounters.set(input.userId, list);
    return existing.count;
  }
  list.push({
    fingerprint: input.fingerprint,
    count: 1,
    lastSeenAt: now,
    scopeHint: input.scopeHint ?? null,
    automationId: input.automationId ?? null,
  });
  store.correctionCounters.set(input.userId, list.slice(-200));
  return 1;
}

export function getCorrectionCount(
  userId: string,
  fingerprint: string,
): number {
  return (
    getStore().correctionCounters.get(userId)?.find(
      (row) => row.fingerprint === fingerprint,
    )?.count ?? 0
  );
}

export function markRejectedFingerprint(
  userId: string,
  fingerprint: string,
): void {
  const store = getStore();
  const set = store.rejectedFingerprints.get(userId) ?? new Set();
  set.add(fingerprint);
  store.rejectedFingerprints.set(userId, set);
}

export function isRejectedFingerprint(
  userId: string,
  fingerprint: string,
): boolean {
  return Boolean(getStore().rejectedFingerprints.get(userId)?.has(fingerprint));
}

export function listCorrectionCounters(userId: string): CorrectionCounter[] {
  return structuredClone(getStore().correctionCounters.get(userId) ?? []);
}

export function clearAllPersonalMemoryData(userId: string): void {
  const store = getStore();
  store.memories.delete(userId);
  store.settings.delete(userId);
  store.correctionCounters.delete(userId);
  store.rejectedFingerprints.delete(userId);
}

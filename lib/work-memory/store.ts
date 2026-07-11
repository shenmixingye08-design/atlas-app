import type {
  WorkMemoryCandidate,
  WorkMemoryRecord,
  WorkMemorySettings,
} from "./types";

type MemoryBucket = WorkMemoryRecord[];
type CandidateBucket = WorkMemoryCandidate[];

type RequestHistoryEntry = {
  fingerprint: string;
  count: number;
  lastAssignment: string;
  lastAt: string;
};

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __atlasWorkMemoryStore?: Map<string, MemoryBucket>;
    __atlasWorkMemoryCandidatesStore?: Map<string, CandidateBucket>;
    __atlasWorkMemorySettingsStore?: Map<string, WorkMemorySettings>;
    __atlasWorkMemoryRequestHistoryStore?: Map<string, RequestHistoryEntry[]>;
    __atlasWorkMemoryHydratedUsers?: Set<string>;
  };
}

function getHydratedUsers(): Set<string> {
  const scope = getGlobalScope();
  if (!scope.__atlasWorkMemoryHydratedUsers) {
    scope.__atlasWorkMemoryHydratedUsers = new Set();
  }
  return scope.__atlasWorkMemoryHydratedUsers;
}

export function isWorkMemoryHydrated(userId: string): boolean {
  return getHydratedUsers().has(userId);
}

export function markWorkMemoryHydrated(userId: string): void {
  getHydratedUsers().add(userId);
}

function getMemoryBucket(userId: string): MemoryBucket {
  const scope = getGlobalScope();
  if (!scope.__atlasWorkMemoryStore) {
    scope.__atlasWorkMemoryStore = new Map();
  }
  const bucket = scope.__atlasWorkMemoryStore.get(userId);
  if (!bucket) {
    scope.__atlasWorkMemoryStore.set(userId, []);
    return scope.__atlasWorkMemoryStore.get(userId)!;
  }
  return bucket;
}

function getCandidateBucket(userId: string): CandidateBucket {
  const scope = getGlobalScope();
  if (!scope.__atlasWorkMemoryCandidatesStore) {
    scope.__atlasWorkMemoryCandidatesStore = new Map();
  }
  const bucket = scope.__atlasWorkMemoryCandidatesStore.get(userId);
  if (!bucket) {
    scope.__atlasWorkMemoryCandidatesStore.set(userId, []);
    return scope.__atlasWorkMemoryCandidatesStore.get(userId)!;
  }
  return bucket;
}

function getSettingsStore(): Map<string, WorkMemorySettings> {
  const scope = getGlobalScope();
  if (!scope.__atlasWorkMemorySettingsStore) {
    scope.__atlasWorkMemorySettingsStore = new Map();
  }
  return scope.__atlasWorkMemorySettingsStore;
}

function getRequestHistoryBucket(userId: string): RequestHistoryEntry[] {
  const scope = getGlobalScope();
  if (!scope.__atlasWorkMemoryRequestHistoryStore) {
    scope.__atlasWorkMemoryRequestHistoryStore = new Map();
  }
  const bucket = scope.__atlasWorkMemoryRequestHistoryStore.get(userId);
  if (!bucket) {
    scope.__atlasWorkMemoryRequestHistoryStore.set(userId, []);
    return scope.__atlasWorkMemoryRequestHistoryStore.get(userId)!;
  }
  return bucket;
}

export function listStoredWorkMemories(userId: string): WorkMemoryRecord[] {
  return [...getMemoryBucket(userId)].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function findStoredWorkMemory(
  userId: string,
  id: string,
): WorkMemoryRecord | null {
  return getMemoryBucket(userId).find((m) => m.id === id) ?? null;
}

export function appendStoredWorkMemory(
  userId: string,
  memory: WorkMemoryRecord,
): WorkMemoryRecord {
  getMemoryBucket(userId).unshift(memory);
  return memory;
}

export function updateStoredWorkMemory(
  userId: string,
  id: string,
  patch: Partial<WorkMemoryRecord>,
): WorkMemoryRecord | null {
  const bucket = getMemoryBucket(userId);
  const index = bucket.findIndex((m) => m.id === id);
  if (index === -1) return null;
  bucket[index] = { ...bucket[index]!, ...patch };
  return bucket[index]!;
}

export function deleteStoredWorkMemory(userId: string, id: string): boolean {
  const bucket = getMemoryBucket(userId);
  const index = bucket.findIndex((m) => m.id === id);
  if (index === -1) return false;
  bucket.splice(index, 1);
  return true;
}

export function resetStoredWorkMemories(
  userId: string,
  type?: WorkMemoryRecord["type"],
): number {
  const bucket = getMemoryBucket(userId);
  if (!type) {
    const count = bucket.length;
    bucket.length = 0;
    return count;
  }
  const before = bucket.length;
  const filtered = bucket.filter((m) => m.type !== type);
  bucket.length = 0;
  bucket.push(...filtered);
  return before - filtered.length;
}

export function countStoredWorkMemories(userId: string): number {
  return getMemoryBucket(userId).length;
}

export function listStoredCandidates(userId: string): WorkMemoryCandidate[] {
  return [...getCandidateBucket(userId)].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function findStoredCandidate(
  userId: string,
  candidateId: string,
): WorkMemoryCandidate | null {
  return (
    getCandidateBucket(userId).find((c) => c.candidateId === candidateId) ?? null
  );
}

export function appendStoredCandidate(
  userId: string,
  candidate: WorkMemoryCandidate,
): WorkMemoryCandidate {
  getCandidateBucket(userId).unshift(candidate);
  return candidate;
}

export function deleteStoredCandidate(
  userId: string,
  candidateId: string,
): boolean {
  const bucket = getCandidateBucket(userId);
  const index = bucket.findIndex((c) => c.candidateId === candidateId);
  if (index === -1) return false;
  bucket.splice(index, 1);
  return true;
}

export function resetStoredCandidates(userId: string): number {
  const bucket = getCandidateBucket(userId);
  const count = bucket.length;
  bucket.length = 0;
  return count;
}

export function readWorkMemorySettings(userId: string): WorkMemorySettings {
  return getSettingsStore().get(userId) ?? { enabled: true };
}

export function writeWorkMemorySettings(
  userId: string,
  settings: WorkMemorySettings,
): WorkMemorySettings {
  getSettingsStore().set(userId, settings);
  return settings;
}

export function recordRequestFingerprint(
  userId: string,
  fingerprint: string,
  assignment: string,
): RequestHistoryEntry {
  const bucket = getRequestHistoryBucket(userId);
  const existing = bucket.find((entry) => entry.fingerprint === fingerprint);
  const now = new Date().toISOString();

  if (existing) {
    existing.count += 1;
    existing.lastAssignment = assignment;
    existing.lastAt = now;
    return existing;
  }

  const entry: RequestHistoryEntry = {
    fingerprint,
    count: 1,
    lastAssignment: assignment,
    lastAt: now,
  };
  bucket.unshift(entry);
  if (bucket.length > 100) bucket.length = 100;
  return entry;
}

export function getRequestFingerprintCount(
  userId: string,
  fingerprint: string,
): number {
  return (
    getRequestHistoryBucket(userId).find((entry) => entry.fingerprint === fingerprint)
      ?.count ?? 0
  );
}

export function getRequestHistorySnapshot(userId: string): RequestHistoryEntry[] {
  return [...getRequestHistoryBucket(userId)];
}

export function replaceRequestHistory(
  userId: string,
  entries: RequestHistoryEntry[],
): void {
  const bucket = getRequestHistoryBucket(userId);
  bucket.length = 0;
  bucket.push(...entries.slice(0, 100));
}

export function replaceStoredWorkMemories(
  userId: string,
  memories: WorkMemoryRecord[],
): void {
  const bucket = getMemoryBucket(userId);
  bucket.length = 0;
  bucket.push(...memories);
}

export function replaceStoredCandidates(
  userId: string,
  candidates: WorkMemoryCandidate[],
): void {
  const bucket = getCandidateBucket(userId);
  bucket.length = 0;
  bucket.push(...candidates);
}

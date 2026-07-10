import type { UserMemory } from "./types";

type MemoryBucket = UserMemory[];

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __atlasUserMemoryStore?: Map<string, MemoryBucket>;
  };
}

function getBucket(userId: string): MemoryBucket {
  const scope = getGlobalScope();
  if (!scope.__atlasUserMemoryStore) {
    scope.__atlasUserMemoryStore = new Map();
  }
  const bucket = scope.__atlasUserMemoryStore.get(userId);
  if (!bucket) {
    scope.__atlasUserMemoryStore.set(userId, []);
    return scope.__atlasUserMemoryStore.get(userId)!;
  }
  return bucket;
}

export function listStoredMemories(userId: string): UserMemory[] {
  return [...getBucket(userId)].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function findStoredMemory(
  userId: string,
  memoryId: string,
): UserMemory | null {
  return getBucket(userId).find((m) => m.memoryId === memoryId) ?? null;
}

export function appendStoredMemory(userId: string, memory: UserMemory): UserMemory {
  getBucket(userId).unshift(memory);
  return memory;
}

export function updateStoredMemory(
  userId: string,
  memoryId: string,
  patch: Partial<UserMemory>,
): UserMemory | null {
  const bucket = getBucket(userId);
  const index = bucket.findIndex((m) => m.memoryId === memoryId);
  if (index === -1) return null;
  bucket[index] = { ...bucket[index]!, ...patch };
  return bucket[index]!;
}

export function deleteStoredMemory(userId: string, memoryId: string): boolean {
  const bucket = getBucket(userId);
  const index = bucket.findIndex((m) => m.memoryId === memoryId);
  if (index === -1) return false;
  bucket.splice(index, 1);
  return true;
}

export function resetStoredMemories(
  userId: string,
  category?: UserMemory["category"],
): number {
  const bucket = getBucket(userId);
  if (!category) {
    const count = bucket.length;
    bucket.length = 0;
    return count;
  }
  const before = bucket.length;
  const filtered = bucket.filter((m) => m.category !== category);
  bucket.length = 0;
  bucket.push(...filtered);
  return before - filtered.length;
}

export function countStoredMemories(userId: string): number {
  return getBucket(userId).length;
}

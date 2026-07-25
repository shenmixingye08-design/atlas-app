import "server-only";

import type { Deliverable, GeneratedDeliverableFile } from "./types";

export type StoredDeliverable = GeneratedDeliverableFile & {
  id: string;
  generatedAt: string;
  /** Clerk user id that owns this generated file. Required for download auth. */
  userId: string;
};

const TTL_MS = 1000 * 60 * 60;

type StoreBucket = Map<string, StoredDeliverable>;

function getStoreBucket(): StoreBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasDeliverableStore?: StoreBucket;
  };

  if (!globalScope.__atlasDeliverableStore) {
    globalScope.__atlasDeliverableStore = new Map();
  }

  return globalScope.__atlasDeliverableStore;
}

function purgeExpiredEntries(store: StoreBucket): void {
  const cutoff = Date.now() - TTL_MS;

  for (const [id, entry] of store.entries()) {
    if (new Date(entry.generatedAt).getTime() < cutoff) {
      store.delete(id);
    }
  }
}

export function saveDeliverableFile(
  file: GeneratedDeliverableFile,
  userId: string,
): StoredDeliverable {
  if (!userId.trim()) {
    throw new Error("userId is required to store a deliverable");
  }

  const store = getStoreBucket();
  purgeExpiredEntries(store);

  const stored: StoredDeliverable = {
    ...file,
    id: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    userId,
  };

  store.set(stored.id, stored);
  return stored;
}

export function getStoredDeliverable(id: string): StoredDeliverable | null {
  const store = getStoreBucket();
  purgeExpiredEntries(store);
  return store.get(id) ?? null;
}

/** Returns the file only when the requester owns it. */
export function getStoredDeliverableForUser(
  id: string,
  userId: string,
): StoredDeliverable | null {
  const stored = getStoredDeliverable(id);
  if (!stored || stored.userId !== userId) return null;
  return stored;
}

export function toDeliverableMetadata(
  stored: StoredDeliverable,
  _requestOrigin?: string,
): Deliverable {
  return {
    id: stored.id,
    fileName: stored.fileName,
    format: stored.format,
    mimeType: stored.mimeType,
    generatedAt: stored.generatedAt,
    sizeBytes: stored.buffer.byteLength,
    isPlaceholder: stored.isPlaceholder,
    // Same-origin relative path — avoids absolute-origin mismatches on mobile
    // (http/https, forwarded host) that break <a download> / cookie scope.
    downloadUrl: `/api/deliverables/${stored.id}`,
  };
}

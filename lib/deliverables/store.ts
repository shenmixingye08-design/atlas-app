import "server-only";

import type { Deliverable, DeliverableFormat, GeneratedDeliverableFile } from "./types";

export type StoredDeliverable = GeneratedDeliverableFile & {
  id: string;
  generatedAt: string;
  contentHash?: string;
};

const TTL_MS = 1000 * 60 * 60 * 24; // 24h — history re-download window

type StoreBucket = Map<string, StoredDeliverable>;
type HashIndex = Map<string, string>;

function getStoreBucket(): StoreBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasDeliverableStore?: StoreBucket;
  };

  if (!globalScope.__atlasDeliverableStore) {
    globalScope.__atlasDeliverableStore = new Map();
  }

  return globalScope.__atlasDeliverableStore;
}

function getHashIndex(): HashIndex {
  const globalScope = globalThis as typeof globalThis & {
    __atlasDeliverableHashIndex?: HashIndex;
  };

  if (!globalScope.__atlasDeliverableHashIndex) {
    globalScope.__atlasDeliverableHashIndex = new Map();
  }

  return globalScope.__atlasDeliverableHashIndex;
}

function purgeExpiredEntries(store: StoreBucket): void {
  const cutoff = Date.now() - TTL_MS;
  const hashIndex = getHashIndex();

  for (const [id, entry] of store.entries()) {
    if (new Date(entry.generatedAt).getTime() < cutoff) {
      store.delete(id);
      if (entry.contentHash) {
        const indexed = hashIndex.get(entry.contentHash);
        if (indexed === id) hashIndex.delete(entry.contentHash);
      }
    }
  }
}

export function saveDeliverableFile(
  file: GeneratedDeliverableFile,
  contentHash?: string,
): StoredDeliverable {
  const store = getStoreBucket();
  purgeExpiredEntries(store);

  if (contentHash) {
    const existingId = getHashIndex().get(contentHash);
    if (existingId) {
      const existing = store.get(existingId);
      if (existing) return existing;
    }
  }

  const stored: StoredDeliverable = {
    ...file,
    id: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    contentHash,
  };

  store.set(stored.id, stored);
  if (contentHash) {
    getHashIndex().set(contentHash, stored.id);
  }
  return stored;
}

export function getStoredDeliverable(id: string): StoredDeliverable | null {
  const store = getStoreBucket();
  purgeExpiredEntries(store);
  return store.get(id) ?? null;
}

export function getStoredDeliverableByHash(
  contentHash: string,
): StoredDeliverable | null {
  const store = getStoreBucket();
  purgeExpiredEntries(store);
  const id = getHashIndex().get(contentHash);
  if (!id) return null;
  return store.get(id) ?? null;
}

export function toDeliverableMetadata(
  stored: StoredDeliverable,
  requestOrigin: string,
): Deliverable {
  const metadata: Deliverable = {
    id: stored.id,
    fileName: stored.fileName,
    format: stored.format,
    mimeType: stored.mimeType,
    generatedAt: stored.generatedAt,
    sizeBytes: stored.buffer.byteLength,
    isPlaceholder: stored.isPlaceholder,
    downloadUrl: `${requestOrigin}/api/deliverables/${stored.id}`,
  };

  // Word/PDF: embed bytes so client can download even when GET /:id hits another instance.
  if (
    (stored.format === "docx" || stored.format === "pdf") &&
    stored.buffer.byteLength > 0
  ) {
    metadata.contentBase64 = stored.buffer.toString("base64");
  }

  return metadata;
}

export function listStoredDeliverableFormats(): DeliverableFormat[] {
  const store = getStoreBucket();
  purgeExpiredEntries(store);
  return [...new Set([...store.values()].map((item) => item.format))];
}

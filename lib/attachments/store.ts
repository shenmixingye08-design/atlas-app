import "server-only";

import type { StoredAttachment } from "./types";

const TTL_MS = 1000 * 60 * 60;

type StoreBucket = Map<string, StoredAttachment>;

function getStoreBucket(): StoreBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasAttachmentStore?: StoreBucket;
  };

  if (!globalScope.__atlasAttachmentStore) {
    globalScope.__atlasAttachmentStore = new Map();
  }

  return globalScope.__atlasAttachmentStore;
}

function purgeExpiredEntries(store: StoreBucket): void {
  const cutoff = Date.now() - TTL_MS;

  for (const [id, entry] of store.entries()) {
    if (new Date(entry.uploadedAt).getTime() < cutoff) {
      store.delete(id);
    }
  }
}

export function saveAttachment(input: {
  fileName: string;
  mimeType: string;
  kind: string;
  buffer: Buffer;
  userId?: string | null;
}): StoredAttachment {
  const store = getStoreBucket();
  purgeExpiredEntries(store);

  const stored: StoredAttachment = {
    id: crypto.randomUUID(),
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.byteLength,
    kind: input.kind,
    buffer: input.buffer,
    uploadedAt: new Date().toISOString(),
    userId: input.userId ?? null,
  };

  store.set(stored.id, stored);
  return stored;
}

export function getStoredAttachment(id: string): StoredAttachment | null {
  const store = getStoreBucket();
  purgeExpiredEntries(store);
  return store.get(id) ?? null;
}

export function deleteStoredAttachment(id: string): boolean {
  const store = getStoreBucket();
  return store.delete(id);
}

/** Test helper — clears all stored attachments. */
export function clearAttachmentStore(): void {
  getStoreBucket().clear();
}

export function storedAttachmentToDataUrl(stored: StoredAttachment): string {
  const base64 = stored.buffer.toString("base64");
  return `data:${stored.mimeType};base64,${base64}`;
}

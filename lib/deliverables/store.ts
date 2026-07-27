import "server-only";

import {
  loadDeliverableFromDisk,
  loadDurableDeliverable,
  persistDurableDeliverable,
  type DurableDeliverableRow,
} from "./durable-store";
import { getDeliverableGenerator } from "./generators";
import type { Deliverable, DeliverableFormat, GeneratedDeliverableFile } from "./types";

export type StoredDeliverable = GeneratedDeliverableFile & {
  id: string;
  generatedAt: string;
  /** Clerk user id that owns this generated file. Required for download auth. */
  userId: string;
  /** Source markdown/text used to regenerate across serverless instances. */
  sourceContent: string;
  baseFileName: string;
};

export const DELIVERABLE_TTL_MS = 1000 * 60 * 60;

/** Cap base64 cache in durable store (~4MB decoded). Larger files regenerate. */
const MAX_BASE64_CACHE_BYTES = 4 * 1024 * 1024;

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
  const cutoff = Date.now() - DELIVERABLE_TTL_MS;

  for (const [id, entry] of store.entries()) {
    if (new Date(entry.generatedAt).getTime() < cutoff) {
      store.delete(id);
    }
  }
}

function stripExtension(fileName: string, format: DeliverableFormat): string {
  const ext = `.${format}`;
  if (fileName.toLowerCase().endsWith(ext)) {
    return fileName.slice(0, -ext.length);
  }
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}

function toDurableRow(stored: StoredDeliverable): DurableDeliverableRow {
  const expiresAt = new Date(
    new Date(stored.generatedAt).getTime() + DELIVERABLE_TTL_MS,
  ).toISOString();
  const contentBase64 =
    stored.buffer.byteLength <= MAX_BASE64_CACHE_BYTES
      ? stored.buffer.toString("base64")
      : null;
  return {
    id: stored.id,
    userId: stored.userId,
    fileName: stored.fileName,
    format: stored.format,
    mimeType: stored.mimeType,
    isPlaceholder: stored.isPlaceholder,
    sourceContent: stored.sourceContent,
    baseFileName: stored.baseFileName,
    sizeBytes: stored.buffer.byteLength,
    contentBase64,
    generatedAt: stored.generatedAt,
    expiresAt,
  };
}

export function resetDeliverableMemoryStoreForTests(): void {
  const globalScope = globalThis as typeof globalThis & {
    __atlasDeliverableStore?: StoreBucket;
  };
  globalScope.__atlasDeliverableStore = new Map();
}

export type SaveDeliverableOptions = {
  sourceContent: string;
  baseFileName?: string;
};

/**
 * Put a generated file into process memory only (no durable I/O).
 * Shared by sync save and durable save to avoid double-persist races.
 */
function putDeliverableInMemory(
  file: GeneratedDeliverableFile,
  userId: string,
  options?: SaveDeliverableOptions,
): StoredDeliverable {
  if (!userId.trim()) {
    throw new Error("userId is required to store a deliverable");
  }

  const store = getStoreBucket();
  purgeExpiredEntries(store);

  const sourceContent = options?.sourceContent?.trim() ?? "";
  const baseFileName =
    options?.baseFileName?.trim() ||
    stripExtension(file.fileName, file.format);

  const stored: StoredDeliverable = {
    ...file,
    id: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    userId,
    sourceContent,
    baseFileName,
  };

  store.set(stored.id, stored);
  return stored;
}

/**
 * Persist a generated file in process memory and durable storage.
 * Durable row enables Word/PDF GET across serverless instances.
 *
 * Sync callers get a single fire-and-forget durable write.
 * Prefer {@link saveDeliverableFileDurable} when the response must wait.
 */
export function saveDeliverableFile(
  file: GeneratedDeliverableFile,
  userId: string,
  options?: SaveDeliverableOptions,
): StoredDeliverable {
  const stored = putDeliverableInMemory(file, userId, options);
  // Exactly one durable write for the sync path (disk + optional Supabase).
  void persistDurableDeliverable(toDurableRow(stored), stored.buffer);
  return stored;
}

/**
 * Awaitable save — use when the caller must ensure durable write before respond.
 *
 * IMPORTANT: Does NOT call {@link saveDeliverableFile} (which would double-write
 * via void + await). Memory put once, then a single awaited durable persist.
 * Supabase being unconfigured must not fail Word generation — disk/memory
 * remain available for download.
 */
export async function saveDeliverableFileDurable(
  file: GeneratedDeliverableFile,
  userId: string,
  options: SaveDeliverableOptions,
): Promise<StoredDeliverable> {
  const stored = putDeliverableInMemory(file, userId, options);
  await persistDurableDeliverable(toDurableRow(stored), stored.buffer);
  return stored;
}

export function getStoredDeliverable(id: string): StoredDeliverable | null {
  const store = getStoreBucket();
  purgeExpiredEntries(store);
  return store.get(id) ?? null;
}

async function hydrateFromDurable(id: string): Promise<StoredDeliverable | null> {
  const durable = await loadDurableDeliverable(id);
  if (!durable) return null;

  if (durable.contentBase64) {
    const buffer = Buffer.from(durable.contentBase64, "base64");
    if (buffer.byteLength > 0) {
      const stored: StoredDeliverable = {
        id: durable.id,
        userId: durable.userId,
        fileName: durable.fileName,
        format: durable.format,
        mimeType: durable.mimeType,
        isPlaceholder: durable.isPlaceholder,
        buffer,
        generatedAt: durable.generatedAt,
        sourceContent: durable.sourceContent,
        baseFileName: durable.baseFileName,
      };
      getStoreBucket().set(stored.id, stored);
      return stored;
    }
  }

  if (!durable.sourceContent.trim()) {
    console.error(
      "[deliverables] durable row missing source_content",
      durable.id,
    );
    return null;
  }

  const generator = getDeliverableGenerator(durable.format);
  if (!generator) {
    console.error(
      "[deliverables] no generator for format",
      durable.format,
      durable.id,
    );
    return null;
  }

  try {
    const file = await generator.generate(
      durable.sourceContent,
      durable.baseFileName,
    );
    const stored: StoredDeliverable = {
      ...file,
      id: durable.id,
      userId: durable.userId,
      generatedAt: durable.generatedAt,
      sourceContent: durable.sourceContent,
      baseFileName: durable.baseFileName,
    };
    getStoreBucket().set(stored.id, stored);
    // Refresh binary cache for subsequent hits.
    void persistDurableDeliverable(toDurableRow(stored), stored.buffer);
    return stored;
  } catch (error) {
    console.error("[deliverables] regenerate from durable failed", id, error);
    return null;
  }
}

/**
 * Memory → disk → Supabase hydrate + regenerate fallback.
 * Fixes serverless: generate on instance A, download on instance B.
 */
export async function getStoredDeliverableForUser(
  id: string,
  userId: string,
): Promise<StoredDeliverable | null> {
  const memory = getStoredDeliverable(id);
  if (memory) {
    if (memory.userId !== userId) return null;
    return memory;
  }

  const fromDisk = loadDeliverableFromDisk(id, userId);
  if (fromDisk) {
    if (fromDisk.buffer.byteLength > 0) {
      getStoreBucket().set(fromDisk.id, fromDisk);
      return fromDisk;
    }
    if (fromDisk.sourceContent.trim()) {
      const hydrated = await hydrateFromDurable(id);
      if (hydrated && hydrated.userId === userId) return hydrated;
      // Regenerate from disk source when Supabase unavailable.
      const generator = getDeliverableGenerator(fromDisk.format);
      if (generator) {
        try {
          const file = await generator.generate(
            fromDisk.sourceContent,
            fromDisk.baseFileName,
          );
          const stored: StoredDeliverable = {
            ...file,
            id: fromDisk.id,
            userId: fromDisk.userId,
            generatedAt: fromDisk.generatedAt,
            sourceContent: fromDisk.sourceContent,
            baseFileName: fromDisk.baseFileName,
          };
          getStoreBucket().set(stored.id, stored);
          void persistDurableDeliverable(toDurableRow(stored), stored.buffer);
          return stored;
        } catch {
          /* fall through */
        }
      }
    }
  }

  const hydrated = await hydrateFromDurable(id);
  if (!hydrated || hydrated.userId !== userId) return null;
  return hydrated;
}

/** True when a deliverable id exists but belongs to another user. */
export function isDeliverableOwnedByOtherUser(
  id: string,
  userId: string,
): boolean {
  const memory = getStoredDeliverable(id);
  if (memory) return memory.userId !== userId;
  return false;
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

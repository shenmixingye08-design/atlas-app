import "server-only";

import {
  DELIVERABLE_MEMORY_TTL_MS,
  DELIVERABLE_METADATA_TTL_MS,
  DELIVERABLE_TTL_MS,
} from "./constants";
import {
  loadBinaryFromDurableStorage,
  loadDeliverableFromDisk,
  loadDurableDeliverable,
  persistDurableDeliverable,
  type DurableDeliverableRow,
  type PersistDurableResult,
} from "./durable-store";
import { consumeWordFault } from "./fault-inject";
import { getDeliverableGenerator } from "./generators";
import {
  assertDownloadIntegrity,
  buildIntegritySnapshot,
  sha256Hex,
} from "./integrity";
import { allowDeliverableDiskFallback } from "./storage-backend";
import type { Deliverable, DeliverableFormat, GeneratedDeliverableFile } from "./types";

export type StoredDeliverable = GeneratedDeliverableFile & {
  id: string;
  generatedAt: string;
  /** Clerk user id that owns this generated file. Required for download auth. */
  userId: string;
  /** Source markdown/text used to regenerate across serverless instances. */
  sourceContent: string;
  baseFileName: string;
  contentSha256?: string | null;
  storageStatus?: string | null;
};

export { DELIVERABLE_TTL_MS, DELIVERABLE_MEMORY_TTL_MS, DELIVERABLE_METADATA_TTL_MS };

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
  const cutoff = Date.now() - DELIVERABLE_MEMORY_TTL_MS;

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
    new Date(stored.generatedAt).getTime() + DELIVERABLE_METADATA_TTL_MS,
  ).toISOString();
  const integrity = buildIntegritySnapshot({
    buffer: stored.buffer,
    format: stored.format,
    fileName: stored.fileName,
  });
  const contentBase64 =
    stored.buffer.byteLength <= 512 * 1024
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
    contentSha256: integrity.sha256,
    storageBucket: null,
    storagePath: null,
    storageStatus: "pending",
    storageError: null,
    hasPkHeader: integrity.hasPkHeader,
    ooxmlVerified: integrity.ooxmlVerified,
    downloadCount: 0,
    lastDownloadedAt: null,
    deletionReason: null,
    deletedAt: null,
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
  /** Stable id for resume / idempotent retries (defaults to random UUID). */
  deliverableId?: string;
};

/**
 * Persist a generated file in process memory and durable storage.
 * Durable row enables Word/PDF GET across serverless instances.
 */
export function saveDeliverableFile(
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

  const integrity = buildIntegritySnapshot({
    buffer: file.buffer,
    format: file.format,
    fileName: file.fileName,
  });

  const stored: StoredDeliverable = {
    ...file,
    id: options?.deliverableId?.trim() || crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    userId,
    sourceContent,
    baseFileName,
    contentSha256: integrity.sha256,
  };

  store.set(stored.id, stored);
  void persistDurableDeliverable(toDurableRow(stored), stored.buffer);
  return stored;
}

/** Awaitable save — use when the caller must ensure durable write before respond. */
export async function saveDeliverableFileDurable(
  file: GeneratedDeliverableFile,
  userId: string,
  options: SaveDeliverableOptions,
): Promise<StoredDeliverable> {
  const stored = saveDeliverableFile(file, userId, options);
  const result = await persistDurableDeliverable(
    toDurableRow(stored),
    stored.buffer,
  );
  stored.storageStatus = result.storageStatus;
  stored.contentSha256 = result.row.contentSha256;
  getStoreBucket().set(stored.id, stored);
  return stored;
}

export async function saveDeliverableFileDurableDetailed(
  file: GeneratedDeliverableFile,
  userId: string,
  options: SaveDeliverableOptions,
): Promise<{ stored: StoredDeliverable; persist: PersistDurableResult }> {
  const stored = saveDeliverableFile(file, userId, options);
  const persist = await persistDurableDeliverable(
    toDurableRow(stored),
    stored.buffer,
  );
  stored.storageStatus = persist.storageStatus;
  stored.contentSha256 = persist.row.contentSha256;
  getStoreBucket().set(stored.id, stored);
  return { stored, persist };
}

export function getStoredDeliverable(id: string): StoredDeliverable | null {
  const store = getStoreBucket();
  purgeExpiredEntries(store);
  return store.get(id) ?? null;
}

function cacheInMemory(stored: StoredDeliverable): StoredDeliverable {
  getStoreBucket().set(stored.id, stored);
  return stored;
}

async function regenerateFromSource(
  durable: DurableDeliverableRow,
): Promise<StoredDeliverable | null> {
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
    const integrity = buildIntegritySnapshot({
      buffer: file.buffer,
      format: file.format,
      fileName: file.fileName,
    });
    const stored: StoredDeliverable = {
      ...file,
      id: durable.id,
      userId: durable.userId,
      generatedAt: durable.generatedAt,
      sourceContent: durable.sourceContent,
      baseFileName: durable.baseFileName,
      contentSha256: integrity.sha256,
      storageStatus: "regenerated",
    };
    cacheInMemory(stored);
    const row = toDurableRow(stored);
    row.storageStatus = "regenerated";
    void persistDurableDeliverable(row, stored.buffer);
    return stored;
  } catch (error) {
    console.error("[deliverables] regenerate from durable failed", durable.id, error);
    return null;
  }
}

async function hydrateFromDurable(id: string): Promise<StoredDeliverable | null> {
  const durable = await loadDurableDeliverable(id);
  if (!durable) return null;

  // 1) Supabase Storage / legacy base64
  const fromStorage = await loadBinaryFromDurableStorage(durable);
  if (fromStorage && fromStorage.byteLength > 0) {
    const stored: StoredDeliverable = {
      id: durable.id,
      userId: durable.userId,
      fileName: durable.fileName,
      format: durable.format,
      mimeType: durable.mimeType,
      isPlaceholder: durable.isPlaceholder,
      buffer: fromStorage,
      generatedAt: durable.generatedAt,
      sourceContent: durable.sourceContent,
      baseFileName: durable.baseFileName,
      contentSha256: durable.contentSha256 ?? sha256Hex(fromStorage),
      storageStatus: durable.storageStatus,
    };
    return cacheInMemory(stored);
  }

  // 2) Regenerate from source content
  return regenerateFromSource(durable);
}

function integrityOk(
  stored: StoredDeliverable,
  expectedSha256?: string | null,
): boolean {
  if (consumeWordFault("sha256_mismatch_on_download")) {
    return false;
  }
  const check = assertDownloadIntegrity({
    buffer: stored.buffer,
    format: stored.format,
    fileName: stored.fileName,
    contentType: stored.mimeType,
    expectedSizeBytes: stored.buffer.byteLength,
    expectedSha256: expectedSha256 ?? stored.contentSha256 ?? null,
    requireOoxml: stored.format === "docx",
  });
  return check.ok;
}

/**
 * Preferred load order (Stage 3):
 * 1. Memory cache (fast path, integrity checked)
 * 2. Durable Storage / DB / regenerate from source
 * 3. Local disk (dev / test / same-instance last resort)
 *
 * Memory or disk alone must never be the only production path.
 */
export async function getStoredDeliverableForUser(
  id: string,
  userId: string,
  options?: { bypassMemory?: boolean; bypassDisk?: boolean },
): Promise<StoredDeliverable | null> {
  if (!options?.bypassMemory) {
    const memory = getStoredDeliverable(id);
    if (memory) {
      if (memory.userId !== userId) return null;
      if (integrityOk(memory, memory.contentSha256)) {
        return memory;
      }
      // Corrupt memory — drop and fall through to durable recovery.
      getStoreBucket().delete(id);
    }
  }

  const hydrated = await hydrateFromDurable(id);
  if (hydrated) {
    if (hydrated.userId !== userId) return null;
    if (integrityOk(hydrated, hydrated.contentSha256)) {
      return hydrated;
    }
    // Integrity failed after durable load — regenerate from source once.
    const durable = await loadDurableDeliverable(id);
    if (durable && durable.userId === userId) {
      getStoreBucket().delete(id);
      const regenerated = await regenerateFromSource(durable);
      if (regenerated && integrityOk(regenerated, regenerated.contentSha256)) {
        return regenerated;
      }
    }
  }

  if (!options?.bypassDisk && allowDeliverableDiskFallback()) {
    const fromDisk = loadDeliverableFromDisk(id, userId);
    if (fromDisk) {
      if (fromDisk.buffer.byteLength > 0) {
        const stored: StoredDeliverable = {
          ...fromDisk,
          contentSha256:
            fromDisk.contentSha256 ?? sha256Hex(fromDisk.buffer),
        };
        if (integrityOk(stored, stored.contentSha256)) {
          return cacheInMemory(stored);
        }
      }
      if (fromDisk.sourceContent.trim()) {
        const durableLike: DurableDeliverableRow = {
          id: fromDisk.id,
          userId: fromDisk.userId,
          fileName: fromDisk.fileName,
          format: fromDisk.format,
          mimeType: fromDisk.mimeType,
          isPlaceholder: fromDisk.isPlaceholder,
          sourceContent: fromDisk.sourceContent,
          baseFileName: fromDisk.baseFileName,
          sizeBytes: fromDisk.buffer.byteLength,
          contentBase64: null,
          contentSha256: fromDisk.contentSha256 ?? null,
          storageBucket: null,
          storagePath: null,
          storageStatus: "pending",
          storageError: null,
          hasPkHeader: null,
          ooxmlVerified: null,
          downloadCount: 0,
          lastDownloadedAt: null,
          deletionReason: null,
          deletedAt: null,
          generatedAt: fromDisk.generatedAt,
          expiresAt: new Date(
            new Date(fromDisk.generatedAt).getTime() + DELIVERABLE_METADATA_TTL_MS,
          ).toISOString(),
        };
        const regenerated = await regenerateFromSource(durableLike);
        if (regenerated && regenerated.userId === userId) return regenerated;
      }
    }
  }

  return null;
}

/**
 * Explicit recovery path used by download route / diagnostics:
 * clear caches → durable → regenerate → re-persist → return.
 */
export async function recoverDeliverableBinary(
  id: string,
  userId: string,
): Promise<StoredDeliverable | null> {
  getStoreBucket().delete(id);
  const durable = await loadDurableDeliverable(id);
  if (!durable || durable.userId !== userId) return null;

  // Try Storage again first
  const fromStorage = await loadBinaryFromDurableStorage(durable);
  if (fromStorage && fromStorage.byteLength > 0) {
    const stored: StoredDeliverable = {
      id: durable.id,
      userId: durable.userId,
      fileName: durable.fileName,
      format: durable.format,
      mimeType: durable.mimeType,
      isPlaceholder: durable.isPlaceholder,
      buffer: fromStorage,
      generatedAt: durable.generatedAt,
      sourceContent: durable.sourceContent,
      baseFileName: durable.baseFileName,
      contentSha256: durable.contentSha256 ?? sha256Hex(fromStorage),
      storageStatus: durable.storageStatus,
    };
    if (integrityOk(stored, durable.contentSha256)) {
      return cacheInMemory(stored);
    }
  }

  const regenerated = await regenerateFromSource(durable);
  if (!regenerated) return null;
  if (!integrityOk(regenerated, regenerated.contentSha256)) return null;
  return regenerated;
}

export function toDeliverableMetadata(
  stored: StoredDeliverable,
  // Kept for call-site compatibility; download URLs are always same-origin relative.
  requestOrigin?: string,
): Deliverable {
  void requestOrigin;
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

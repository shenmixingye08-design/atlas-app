import "server-only";

import {
  normalizeToStructuredDocument,
  renderCanonicalHtml,
  STRUCTURED_DOCUMENT_VERSION,
} from "@/lib/deliverables/document";

import {
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

  let normalizedDocument: unknown = null;
  let canonicalHtml: string | null = null;
  let normalizationVersion: string | null = null;
  if (stored.sourceContent.trim()) {
    try {
      const normalized = normalizeToStructuredDocument(stored.sourceContent, {
        titleHint: stored.baseFileName,
      });
      normalizedDocument = normalized.document;
      canonicalHtml = renderCanonicalHtml(normalized.document).html;
      normalizationVersion = STRUCTURED_DOCUMENT_VERSION;
    } catch {
      // Best-effort enrichment only.
    }
  }

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
    normalizedDocument,
    canonicalHtml,
    normalizationVersion,
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

  const stored: StoredDeliverable = {
    ...file,
    id: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    userId,
    sourceContent,
    baseFileName,
  };

  store.set(stored.id, stored);
  void persistDurableDeliverable(toDurableRow(stored));
  return stored;
}

/** Awaitable save — use when the caller must ensure durable write before respond. */
export async function saveDeliverableFileDurable(
  file: GeneratedDeliverableFile,
  userId: string,
  options: SaveDeliverableOptions,
): Promise<StoredDeliverable> {
  const stored = saveDeliverableFile(file, userId, options);
  await persistDurableDeliverable(toDurableRow(stored));
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
    void persistDurableDeliverable(toDurableRow(stored));
    return stored;
  } catch (error) {
    console.error("[deliverables] regenerate from durable failed", id, error);
    return null;
  }
}

/**
 * Memory-first lookup with durable hydrate + regenerate fallback.
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

  const hydrated = await hydrateFromDurable(id);
  if (!hydrated || hydrated.userId !== userId) return null;
  return hydrated;
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

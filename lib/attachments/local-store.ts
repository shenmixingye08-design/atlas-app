import "server-only";

import {
  ATTACHMENT_LIMITS,
  type SaveImageAttachmentInput,
  type StoredImageAttachment,
} from "./types";

type LocalAttachmentRow = {
  meta: StoredImageAttachment;
  originalBuffer: Buffer;
  processedBuffer: Buffer;
};

type LocalBucket = Map<string, LocalAttachmentRow>;

function getBucket(): LocalBucket {
  const g = globalThis as typeof globalThis & {
    __atlasLocalAttachments?: LocalBucket;
  };
  if (!g.__atlasLocalAttachments) g.__atlasLocalAttachments = new Map();
  return g.__atlasLocalAttachments;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unknown";
}

function isExpired(meta: StoredImageAttachment): boolean {
  if (meta.retentionPolicy === "retained") return false;
  if (!meta.expiresAt) return false;
  return Date.parse(meta.expiresAt) < Date.now();
}

export async function localSaveImageAttachment(
  input: SaveImageAttachmentInput,
): Promise<StoredImageAttachment> {
  const id = `img_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const jobId = sanitizeSegment(input.jobId?.trim() || "pending");
  const retentionPolicy = input.retentionPolicy ?? "temporary";
  const now = new Date();
  const meta: StoredImageAttachment = {
    id,
    userId: input.userId,
    jobId,
    originalFileName: input.originalFileName.slice(0, 180),
    mimeType: input.processedMimeType,
    originalMimeType: input.mimeType,
    originalBytes: input.originalBuffer.length,
    processedBytes: input.processedBuffer.length,
    width: input.width,
    height: input.height,
    contentHash: input.contentHash,
    createdAt: now.toISOString(),
    expiresAt:
      retentionPolicy === "retained"
        ? null
        : new Date(now.getTime() + ATTACHMENT_LIMITS.ttlMs).toISOString(),
    retentionPolicy,
    originalPath: `memory://${input.userId}/${jobId}/${id}/original`,
    processedPath: `memory://${input.userId}/${jobId}/${id}/processed`,
    storageBackend: "local",
  };
  getBucket().set(id, {
    meta,
    originalBuffer: Buffer.from(input.originalBuffer),
    processedBuffer: Buffer.from(input.processedBuffer),
  });
  return meta;
}

export async function localGetImageAttachmentForUser(
  userId: string,
  id: string,
): Promise<StoredImageAttachment | null> {
  const row = getBucket().get(id);
  if (!row || row.meta.userId !== userId) return null;
  if (isExpired(row.meta)) {
    getBucket().delete(id);
    return null;
  }
  return row.meta;
}

export async function localReadProcessedImageBytes(
  userId: string,
  id: string,
): Promise<{ buffer: Buffer; mimeType: string; meta: StoredImageAttachment } | null> {
  const row = getBucket().get(id);
  if (!row || row.meta.userId !== userId) return null;
  if (isExpired(row.meta)) {
    getBucket().delete(id);
    return null;
  }
  return {
    buffer: row.processedBuffer,
    mimeType: row.meta.mimeType,
    meta: row.meta,
  };
}

export async function localDeleteImageAttachment(
  userId: string,
  id: string,
): Promise<boolean> {
  const row = getBucket().get(id);
  if (!row || row.meta.userId !== userId) return false;
  getBucket().delete(id);
  return true;
}

export async function localFindAttachmentByHash(
  userId: string,
  contentHash: string,
): Promise<StoredImageAttachment | null> {
  for (const row of getBucket().values()) {
    if (row.meta.userId !== userId || row.meta.contentHash !== contentHash) {
      continue;
    }
    if (isExpired(row.meta)) {
      getBucket().delete(row.meta.id);
      continue;
    }
    return row.meta;
  }
  return null;
}

export async function localMarkAttachmentRetained(
  userId: string,
  id: string,
): Promise<StoredImageAttachment | null> {
  const row = getBucket().get(id);
  if (!row || row.meta.userId !== userId) return null;
  const next: StoredImageAttachment = {
    ...row.meta,
    retentionPolicy: "retained",
    expiresAt: null,
  };
  row.meta = next;
  getBucket().set(id, row);
  return next;
}

/** Update logical jobId (in-memory only — no disk paths). */
export async function localBindAttachmentToJob(
  userId: string,
  id: string,
  jobId: string,
): Promise<StoredImageAttachment | null> {
  const nextJobId = jobId.trim();
  if (!nextJobId) return null;
  const row = getBucket().get(id);
  if (!row || row.meta.userId !== userId) return null;
  if (isExpired(row.meta)) {
    getBucket().delete(id);
    return null;
  }
  const next: StoredImageAttachment = {
    ...row.meta,
    jobId: nextJobId,
  };
  row.meta = next;
  getBucket().set(id, row);
  return next;
}

export async function localPurgeExpiredAttachments(): Promise<number> {
  let purged = 0;
  for (const [id, row] of [...getBucket().entries()]) {
    if (!isExpired(row.meta)) continue;
    getBucket().delete(id);
    purged += 1;
  }
  return purged;
}

export function resetLocalAttachmentStoreForTests(): void {
  getBucket().clear();
}

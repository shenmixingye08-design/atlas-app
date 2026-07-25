import "server-only";

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { ATTACHMENT_LIMITS, type SaveImageAttachmentInput, type StoredImageAttachment } from "./types";

const ROOT = path.join(process.cwd(), ".data", "attachments");

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "unknown";
}

function attachmentDir(userId: string, jobId: string, id: string): string {
  return path.join(ROOT, sanitizeSegment(userId), sanitizeSegment(jobId), sanitizeSegment(id));
}

function metaPath(userId: string, jobId: string, id: string): string {
  return path.join(attachmentDir(userId, jobId, id), "meta.json");
}

function extForMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

function isExpired(meta: StoredImageAttachment): boolean {
  if (meta.retentionPolicy === "retained") return false;
  if (!meta.expiresAt) return false;
  return Date.parse(meta.expiresAt) < Date.now();
}

function listAllMetaFiles(): string[] {
  if (!existsSync(ROOT)) return [];
  const files: string[] = [];
  for (const userEntry of readdirSync(ROOT)) {
    const userPath = path.join(ROOT, userEntry);
    if (!existsSync(userPath)) continue;
    for (const jobEntry of readdirSync(userPath)) {
      const jobPath = path.join(userPath, jobEntry);
      if (!existsSync(jobPath)) continue;
      for (const idEntry of readdirSync(jobPath)) {
        const metaFile = path.join(jobPath, idEntry, "meta.json");
        if (existsSync(metaFile)) files.push(metaFile);
      }
    }
  }
  return files;
}

function readMetaFile(file: string): StoredImageAttachment | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as StoredImageAttachment;
  } catch {
    return null;
  }
}

export async function localSaveImageAttachment(
  input: SaveImageAttachmentInput,
): Promise<StoredImageAttachment> {
  const id = `img_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const jobId = sanitizeSegment(input.jobId?.trim() || "pending");
  const retentionPolicy = input.retentionPolicy ?? "temporary";
  const dir = attachmentDir(input.userId, jobId, id);
  mkdirSync(dir, { recursive: true });

  const originalExt = extForMime(input.mimeType);
  const processedExt = extForMime(input.processedMimeType);
  const originalPath = path.join(dir, `original.${originalExt}`);
  const processedPath = path.join(dir, `processed.${processedExt}`);
  writeFileSync(originalPath, input.originalBuffer);
  writeFileSync(processedPath, input.processedBuffer);

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
    originalPath,
    processedPath,
    storageBackend: "local",
  };
  writeFileSync(metaPath(input.userId, jobId, id), JSON.stringify(meta));
  return meta;
}

export async function localGetImageAttachmentForUser(
  userId: string,
  id: string,
): Promise<StoredImageAttachment | null> {
  for (const file of listAllMetaFiles()) {
    const meta = readMetaFile(file);
    if (!meta || meta.id !== id) continue;
    if (meta.userId !== userId) return null;
    if (isExpired(meta)) {
      rmSync(path.dirname(file), { recursive: true, force: true });
      return null;
    }
    return meta;
  }
  return null;
}

export async function localReadProcessedImageBytes(
  userId: string,
  id: string,
): Promise<{ buffer: Buffer; mimeType: string; meta: StoredImageAttachment } | null> {
  const meta = await localGetImageAttachmentForUser(userId, id);
  if (!meta || !existsSync(meta.processedPath)) return null;
  return {
    buffer: readFileSync(meta.processedPath),
    mimeType: meta.mimeType,
    meta,
  };
}

export async function localDeleteImageAttachment(
  userId: string,
  id: string,
): Promise<boolean> {
  for (const file of listAllMetaFiles()) {
    const meta = readMetaFile(file);
    if (!meta || meta.id !== id) continue;
    if (meta.userId !== userId) return false;
    rmSync(path.dirname(file), { recursive: true, force: true });
    return true;
  }
  return false;
}

export async function localFindAttachmentByHash(
  userId: string,
  contentHash: string,
): Promise<StoredImageAttachment | null> {
  for (const file of listAllMetaFiles()) {
    const meta = readMetaFile(file);
    if (!meta) continue;
    if (meta.userId !== userId || meta.contentHash !== contentHash) continue;
    if (isExpired(meta)) {
      rmSync(path.dirname(file), { recursive: true, force: true });
      continue;
    }
    return meta;
  }
  return null;
}

export async function localMarkAttachmentRetained(
  userId: string,
  id: string,
): Promise<StoredImageAttachment | null> {
  for (const file of listAllMetaFiles()) {
    const meta = readMetaFile(file);
    if (!meta || meta.id !== id || meta.userId !== userId) continue;
    const next: StoredImageAttachment = {
      ...meta,
      retentionPolicy: "retained",
      expiresAt: null,
    };
    writeFileSync(file, JSON.stringify(next));
    return next;
  }
  return null;
}

export async function localPurgeExpiredAttachments(): Promise<number> {
  let purged = 0;
  for (const file of listAllMetaFiles()) {
    const meta = readMetaFile(file);
    if (!meta || !isExpired(meta)) continue;
    rmSync(path.dirname(file), { recursive: true, force: true });
    purged += 1;
  }
  return purged;
}

import "server-only";

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import path from "node:path";

import { ATTACHMENT_LIMITS, type StoredImageAttachment } from "./types";

const ROOT = path.join(process.cwd(), ".data", "attachments");

function userDir(userId: string): string {
  return path.join(ROOT, userId);
}

function attachmentDir(userId: string, id: string): string {
  return path.join(userDir(userId), id);
}

function metaPath(userId: string, id: string): string {
  return path.join(attachmentDir(userId, id), "meta.json");
}

function purgeExpired(userId: string): void {
  const dir = userDir(userId);
  if (!existsSync(dir)) return;
  // Lazy purge: only when accessed; ignore errors.
  try {
    for (const entry of readdirSync(dir)) {
      const metaFile = path.join(dir, entry, "meta.json");
      if (!existsSync(metaFile)) continue;
      try {
        const meta = JSON.parse(readFileSync(metaFile, "utf8")) as StoredImageAttachment;
        if (Date.parse(meta.expiresAt) < Date.now()) {
          rmSync(path.join(dir, entry), { recursive: true, force: true });
        }
      } catch {
        // ignore corrupt meta
      }
    }
  } catch {
    // ignore
  }
}

export function saveImageAttachment(input: {
  userId: string;
  originalFileName: string;
  mimeType: string;
  originalBuffer: Buffer;
  processedBuffer: Buffer;
  processedMimeType: string;
  width: number;
  height: number;
  contentHash: string;
}): StoredImageAttachment {
  purgeExpired(input.userId);
  const id = `img_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const dir = attachmentDir(input.userId, id);
  mkdirSync(dir, { recursive: true });

  const originalExt =
    input.mimeType.includes("png")
      ? "png"
      : input.mimeType.includes("webp")
        ? "webp"
        : "jpg";
  const processedExt =
    input.processedMimeType.includes("png")
      ? "png"
      : input.processedMimeType.includes("webp")
        ? "webp"
        : "jpg";

  const originalPath = path.join(dir, `original.${originalExt}`);
  const processedPath = path.join(dir, `processed.${processedExt}`);
  writeFileSync(originalPath, input.originalBuffer);
  writeFileSync(processedPath, input.processedBuffer);

  const now = new Date();
  const meta: StoredImageAttachment = {
    id,
    userId: input.userId,
    originalFileName: input.originalFileName.slice(0, 180),
    mimeType: input.processedMimeType,
    originalBytes: input.originalBuffer.length,
    processedBytes: input.processedBuffer.length,
    width: input.width,
    height: input.height,
    contentHash: input.contentHash,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ATTACHMENT_LIMITS.ttlMs).toISOString(),
    originalPath,
    processedPath,
  };
  writeFileSync(metaPath(input.userId, id), JSON.stringify(meta));
  return meta;
}

export function getImageAttachmentForUser(
  userId: string,
  id: string,
): StoredImageAttachment | null {
  purgeExpired(userId);
  const file = metaPath(userId, id);
  if (!existsSync(file)) return null;
  try {
    const meta = JSON.parse(readFileSync(file, "utf8")) as StoredImageAttachment;
    if (meta.userId !== userId) return null;
    if (Date.parse(meta.expiresAt) < Date.now()) {
      rmSync(attachmentDir(userId, id), { recursive: true, force: true });
      return null;
    }
    return meta;
  } catch {
    return null;
  }
}

export function readProcessedImageBytes(
  userId: string,
  id: string,
): { buffer: Buffer; mimeType: string; meta: StoredImageAttachment } | null {
  const meta = getImageAttachmentForUser(userId, id);
  if (!meta || !existsSync(meta.processedPath)) return null;
  return {
    buffer: readFileSync(meta.processedPath),
    mimeType: meta.mimeType,
    meta,
  };
}

export function deleteImageAttachment(userId: string, id: string): boolean {
  const meta = getImageAttachmentForUser(userId, id);
  if (!meta) return false;
  rmSync(attachmentDir(userId, id), { recursive: true, force: true });
  return true;
}

export function findAttachmentByHash(
  userId: string,
  contentHash: string,
): StoredImageAttachment | null {
  purgeExpired(userId);
  const dir = userDir(userId);
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry, "meta.json");
    if (!existsSync(file)) continue;
    try {
      const meta = JSON.parse(readFileSync(file, "utf8")) as StoredImageAttachment;
      if (meta.userId === userId && meta.contentHash === contentHash) {
        return meta;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

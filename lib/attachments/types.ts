import type { AttachmentRetentionPolicy } from "./constants";

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type SupportedImageMime = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

export const ATTACHMENT_LIMITS = {
  maxImagesPerRequest: 10,
  maxOriginalBytes: 20 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  ttlMs: 1000 * 60 * 60 * 24,
} as const;

export type StoredImageAttachment = {
  id: string;
  userId: string;
  /** Commander/job scope; used in Storage path. Defaults to pending. */
  jobId: string;
  originalFileName: string;
  mimeType: string;
  originalMimeType?: string | null;
  originalBytes: number;
  processedBytes: number;
  width: number;
  height: number;
  contentHash: string;
  createdAt: string;
  /** Null when retentionPolicy is retained (no TTL purge). */
  expiresAt: string | null;
  retentionPolicy: AttachmentRetentionPolicy;
  /** Storage object key or local absolute path for original bytes. */
  originalPath: string;
  /** Storage object key or local absolute path for processed bytes. */
  processedPath: string;
  /** Where bytes are stored. */
  storageBackend: "local" | "supabase";
};

export type AttachmentUploadResult = {
  attachment: StoredImageAttachment;
  warnings: string[];
};

export type SaveImageAttachmentInput = {
  userId: string;
  jobId?: string | null;
  originalFileName: string;
  mimeType: string;
  originalBuffer: Buffer;
  processedBuffer: Buffer;
  processedMimeType: string;
  width: number;
  height: number;
  contentHash: string;
  retentionPolicy?: AttachmentRetentionPolicy;
};

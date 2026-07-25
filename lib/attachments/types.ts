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
  maxImagesPerRequest: 8,
  maxOriginalBytes: 10 * 1024 * 1024,
  maxTotalBytes: 40 * 1024 * 1024,
  ttlMs: 1000 * 60 * 60 * 24,
} as const;

export type StoredImageAttachment = {
  id: string;
  userId: string;
  originalFileName: string;
  mimeType: string;
  originalBytes: number;
  processedBytes: number;
  width: number;
  height: number;
  contentHash: string;
  createdAt: string;
  expiresAt: string;
  /** Relative path under attachment root. */
  originalPath: string;
  processedPath: string;
};

export type AttachmentUploadResult = {
  attachment: StoredImageAttachment;
  warnings: string[];
};

/** Attachment kinds used by the work-request UI. */
export type AttachmentKind =
  | "photo"
  | "pdf"
  | "video"
  | "word"
  | "excel"
  | "powerpoint"
  | "other";

/** Server-side stored upload (bytes live in the attachment store). */
export type StoredAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind | string;
  buffer: Buffer;
  uploadedAt: string;
  userId: string | null;
};

/**
 * Metadata shape passed through Commander → orchestration → agent runner.
 * Image bytes stay in storage; only `storageId` is referenced here.
 */
export type AttachmentMetadataItem = {
  name: string;
  kind: AttachmentKind | string;
  mimeType: string | null;
  size: number;
  /** True when image bytes were stored and can be sent as input_image. */
  contentAvailable: boolean;
  /** Attachment store id for server-side byte lookup. */
  storageId?: string | null;
  /** Optional public/data URL (prefer storageId; used as fallback). */
  imageUrl?: string | null;
  /** Set when upload/read failed for an image. */
  fetchFailed?: boolean;
  note?: string | null;
};

export type ImageDetailLevel = "low" | "high" | "auto" | "original";

export const ATTACHMENTS_METADATA_KEY = "attachments" as const;
export const ATTACHMENT_CONTENT_NOTE_KEY = "attachmentContentNote" as const;

/** Max images sent to Vision per AI call (cost control). */
export const MAX_VISION_IMAGES = 20;

/** Max upload size per image (bytes). */
export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Supported image MIME types for Vision. */
export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
] as const;

export const IMAGE_FETCH_FAILED_MESSAGE =
  "画像を読み込めませんでした。通信環境を確認し、画像をもう一度添付してください。";

export const UNSUPPORTED_IMAGE_TYPE_MESSAGE =
  "このファイル形式には対応していません。JPEG / PNG / WebP / HEIC の画像を添付してください。";

export const IMAGE_TOO_LARGE_MESSAGE =
  "画像サイズが上限を超えています。8MB以下の画像を添付してください。";

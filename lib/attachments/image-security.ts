import { ATTACHMENT_LIMITS, SUPPORTED_IMAGE_MIME_TYPES } from "./types";

export type ImageValidationErrorCode =
  | "unsupported_type"
  | "too_large"
  | "too_many"
  | "empty"
  | "heic_unsupported";

export class ImageValidationError extends Error {
  readonly code: ImageValidationErrorCode;

  constructor(code: ImageValidationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ImageValidationError";
  }
}

export function normalizeMimeType(mime: string, fileName?: string): string {
  const lower = mime.toLowerCase().trim();
  if (lower === "image/jpg") return "image/jpeg";
  if (SUPPORTED_IMAGE_MIME_TYPES.includes(lower as (typeof SUPPORTED_IMAGE_MIME_TYPES)[number])) {
    return lower;
  }
  const ext = fileName?.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  return lower;
}

export function assertSupportedImage(input: {
  mimeType: string;
  fileName?: string;
  byteLength: number;
}): string {
  if (input.byteLength <= 0) {
    throw new ImageValidationError("empty", "画像ファイルが空です");
  }
  if (input.byteLength > ATTACHMENT_LIMITS.maxOriginalBytes) {
    throw new ImageValidationError(
      "too_large",
      `画像サイズは${Math.round(ATTACHMENT_LIMITS.maxOriginalBytes / (1024 * 1024))}MB以下にしてください`,
    );
  }
  const mime = normalizeMimeType(input.mimeType, input.fileName);
  if (
    !SUPPORTED_IMAGE_MIME_TYPES.includes(
      mime as (typeof SUPPORTED_IMAGE_MIME_TYPES)[number],
    )
  ) {
    throw new ImageValidationError(
      "unsupported_type",
      "対応形式は JPEG / PNG / WEBP（HEICは変換可能な場合のみ）です",
    );
  }
  return mime;
}

export function assertImageBatchLimits(count: number, totalBytes: number): void {
  if (count > ATTACHMENT_LIMITS.maxImagesPerRequest) {
    throw new ImageValidationError(
      "too_many",
      `一度に添付できる画像は${ATTACHMENT_LIMITS.maxImagesPerRequest}枚までです`,
    );
  }
  if (totalBytes > ATTACHMENT_LIMITS.maxTotalBytes) {
    throw new ImageValidationError(
      "too_large",
      "添付画像の合計サイズが上限を超えています",
    );
  }
}

/** Never put raw image URLs or base64 into logs. */
export function redactForLog(value: string): string {
  return value
    .replace(/data:image\/[a-zA-Z+]+;base64,[A-Za-z0-9+/=]+/g, "[image_data_redacted]")
    .replace(/\/api\/attachments\/images\/[a-zA-Z0-9_-]+/g, "/api/attachments/images/[id]");
}

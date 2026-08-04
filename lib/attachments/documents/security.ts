import { DOCUMENT_ATTACHMENT_LIMITS, SUPPORTED_DOCUMENT_MIME_TYPES } from "./types";

const BLOCKED_EXTENSIONS = new Set([
  "exe",
  "js",
  "mjs",
  "cjs",
  "sh",
  "bat",
  "cmd",
  "apk",
  "dll",
  "com",
  "scr",
  "vbs",
  "ps1",
  "html",
  "htm",
  "svg",
  "xml",
]);

const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt: "application/vnd.ms-powerpoint",
  txt: "text/plain",
  rtf: "application/rtf",
};

export class DocumentValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DocumentValidationError";
    this.code = code;
  }
}

export function sanitizeOriginalFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^\w.\u3040-\u30ff\u4e00-\u9fff()-]+/g, "_").slice(0, 180);
}

export function normalizeDocumentMime(
  fileName: string,
  declaredMime: string,
): string {
  const declared = declaredMime.toLowerCase().trim();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (
    declared &&
    (SUPPORTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(declared)
  ) {
    return declared;
  }
  return EXT_TO_MIME[ext] ?? declared;
}

export function assertSupportedDocument(input: {
  fileName: string;
  mimeType: string;
  bytes: number;
}): string {
  const safeName = sanitizeOriginalFileName(input.fileName);
  const ext = safeName.split(".").pop()?.toLowerCase() ?? "";
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new DocumentValidationError(
      "unsupported_file_type",
      "このファイル形式には対応していません",
    );
  }

  const mime = normalizeDocumentMime(safeName, input.mimeType);
  const allowed =
    (SUPPORTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mime) ||
    Boolean(EXT_TO_MIME[ext]);

  if (!allowed) {
    throw new DocumentValidationError(
      "unsupported_file_type",
      "このファイル形式には対応していません",
    );
  }

  if (input.bytes <= 0) {
    throw new DocumentValidationError("empty", "ファイルが空です");
  }

  if (input.bytes > DOCUMENT_ATTACHMENT_LIMITS.maxOriginalBytes) {
    throw new DocumentValidationError(
      "file_too_large",
      "ファイルサイズが上限を超えています",
    );
  }

  return mime;
}

export function assertDocumentBatchLimits(
  files: Array<{ bytes: number }>,
): void {
  if (files.length > DOCUMENT_ATTACHMENT_LIMITS.maxFilesPerRequest) {
    throw new DocumentValidationError(
      "too_many_files",
      `添付は最大${DOCUMENT_ATTACHMENT_LIMITS.maxFilesPerRequest}件までです`,
    );
  }
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  if (total > DOCUMENT_ATTACHMENT_LIMITS.maxTotalBytes) {
    throw new DocumentValidationError(
      "file_too_large",
      "添付ファイルの合計サイズが上限を超えています",
    );
  }
}

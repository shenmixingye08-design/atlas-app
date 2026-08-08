import { detectDocumentKindFromBytes } from "@/lib/security/file-magic";
import {
  sanitizeDisplayFileName,
  UnsafePathError,
} from "@/lib/security/upload-path";

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

const OOXML_EXT = new Set(["docx", "xlsx", "pptx"]);
const OLE_EXT = new Set(["doc", "xls", "ppt"]);

export class DocumentValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DocumentValidationError";
    this.code = code;
  }
}

export function sanitizeOriginalFileName(name: string): string {
  try {
    return sanitizeDisplayFileName(name);
  } catch (error) {
    if (error instanceof UnsafePathError) {
      throw new DocumentValidationError("unsupported_file_type", error.message);
    }
    throw error;
  }
}

export function normalizeDocumentMime(
  fileName: string,
  declaredMime: string,
): string {
  const declared = declaredMime.toLowerCase().trim();
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  // Prefer extension over client-declared MIME (P0-05).
  if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext]!;
  if (
    declared &&
    (SUPPORTED_DOCUMENT_MIME_TYPES as readonly string[]).includes(declared)
  ) {
    return declared;
  }
  return declared;
}

export function assertSupportedDocument(input: {
  fileName: string;
  mimeType: string;
  bytes: number;
  buffer?: Buffer;
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

  if (input.buffer) {
    const kind = detectDocumentKindFromBytes(input.buffer);
    if (ext === "pdf" && kind !== "pdf") {
      throw new DocumentValidationError(
        "unsupported_file_type",
        "PDF形式を確認できませんでした",
      );
    }
    if (OOXML_EXT.has(ext) && kind !== "ooxml_zip") {
      throw new DocumentValidationError(
        "unsupported_file_type",
        "Office文書形式を確認できませんでした",
      );
    }
    if (OLE_EXT.has(ext) && kind !== "ole" && kind !== "ooxml_zip") {
      throw new DocumentValidationError(
        "unsupported_file_type",
        "Office文書形式を確認できませんでした",
      );
    }
    if ((ext === "txt" || ext === "csv" || ext === "rtf") && kind === "ooxml_zip") {
      throw new DocumentValidationError(
        "unsupported_file_type",
        "テキスト形式を確認できませんでした",
      );
    }
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

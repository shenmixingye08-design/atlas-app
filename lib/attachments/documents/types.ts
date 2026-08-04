/** Shared limits for request document attachments (PDF / Office / text). */
export const DOCUMENT_ATTACHMENT_LIMITS = {
  maxFilesPerRequest: 10,
  maxOriginalBytes: 20 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxExtractedChars: 80_000,
} as const;

export const SUPPORTED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/csv",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "application/rtf",
  "text/rtf",
] as const;

export type SupportedDocumentMime =
  (typeof SUPPORTED_DOCUMENT_MIME_TYPES)[number];

export type DocumentExtractResult = {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  extractedText: string;
  pageOrSheetCount: number | null;
  warnings: string[];
};

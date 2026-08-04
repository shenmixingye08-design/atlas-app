import "server-only";

import {
  DELIVERABLE_EXTENSIONS,
  DELIVERABLE_MIME_TYPES,
  type DeliverableFormat,
} from "./types";

/** Forbidden response / Blob MIME types for Word downloads. */
export const FORBIDDEN_DELIVERABLE_MIME_TYPES = [
  "text/plain",
  "application/json",
  "application/octet-stream",
  "text/html",
] as const;

export function isZipOoxmlMagic(bytes: ArrayBuffer | Uint8Array | Buffer): boolean {
  const view =
    bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes);
  return view.byteLength >= 2 && view[0] === 0x50 && view[1] === 0x4b; // PK
}

export function mimeTypeForFormat(format: DeliverableFormat): string {
  return DELIVERABLE_MIME_TYPES[format];
}

export function ensureFormatFileName(
  fileName: string,
  format: DeliverableFormat,
): string {
  const ext = DELIVERABLE_EXTENSIONS[format];
  const trimmed = fileName.trim() || `document${ext}`;
  if (trimmed.toLowerCase().endsWith(ext)) return trimmed;
  // Strip a wrong trailing extension then append the correct one.
  const withoutExt = trimmed.replace(/\.[^.]+$/, "");
  return `${withoutExt || "document"}${ext}`;
}

export function assertOfficeBinaryOrThrow(
  format: DeliverableFormat,
  bytes: ArrayBuffer | Uint8Array | Buffer,
): void {
  if (format === "docx" || format === "xlsx" || format === "pptx") {
    if (!isZipOoxmlMagic(bytes)) {
      throw new Error(`${format}_not_ooxml_zip`);
    }
  }
  if (format === "pdf") {
    const view =
      bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : new Uint8Array(bytes);
    const head = String.fromCharCode(...view.subarray(0, 4));
    if (head !== "%PDF") {
      throw new Error("pdf_invalid_header");
    }
  }
}

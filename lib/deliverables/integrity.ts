import { createHash } from "node:crypto";

import { DELIVERABLE_MIME_TYPES, type DeliverableFormat } from "./types";

export type IntegritySnapshot = {
  sizeBytes: number;
  sha256: string;
  mimeType: string;
  format: DeliverableFormat;
  fileName: string;
  hasPkHeader: boolean;
  ooxmlVerified: boolean;
  ooxmlMissing: string[];
};

const OOXML_REQUIRED = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
] as const;

const XLSX_OOXML_REQUIRED = [
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/styles.xml",
  "xl/_rels/workbook.xml.rels",
] as const;

export function sha256Hex(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function hasPkHeader(buffer: Buffer | Uint8Array): boolean {
  return buffer.byteLength >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/**
 * List ZIP central-directory entry names without external deps.
 * Used for OOXML structure checks at generate/download time.
 */
export function listZipEntryNames(buffer: Buffer): string[] {
  if (!hasPkHeader(buffer)) return [];

  // End of central directory signature: PK\x05\x06
  let eocd = -1;
  const minEocd = Math.max(0, buffer.byteLength - 65_536 - 22);
  for (let i = buffer.byteLength - 22; i >= minEocd; i -= 1) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];

  const totalEntries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const names: string[] = [];

  for (let n = 0; n < totalEntries; n += 1) {
    if (offset + 46 > buffer.byteLength) break;
    if (
      buffer[offset] !== 0x50 ||
      buffer[offset + 1] !== 0x4b ||
      buffer[offset + 2] !== 0x01 ||
      buffer[offset + 3] !== 0x02
    ) {
      break;
    }
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > buffer.byteLength) break;
    names.push(buffer.subarray(nameStart, nameEnd).toString("utf8"));
    offset = nameEnd + extraLen + commentLen;
  }

  return names;
}

export function verifyOoxmlStructure(buffer: Buffer): {
  ok: boolean;
  missing: string[];
} {
  const names = new Set(listZipEntryNames(buffer));
  const missing = OOXML_REQUIRED.filter((required) => !names.has(required));
  return { ok: missing.length === 0, missing: [...missing] };
}

export function verifyXlsxOoxmlStructure(buffer: Buffer): {
  ok: boolean;
  missing: string[];
} {
  const names = new Set(listZipEntryNames(buffer));
  const missing: string[] = XLSX_OOXML_REQUIRED.filter(
    (required) => !names.has(required),
  );
  const hasWorksheet = [...names].some((n) =>
    /^xl\/worksheets\/sheet\d+\.xml$/i.test(n),
  );
  if (!hasWorksheet) missing.push("xl/worksheets/sheet1.xml");
  return { ok: missing.length === 0, missing };
}

export function buildIntegritySnapshot(input: {
  buffer: Buffer;
  format: DeliverableFormat;
  fileName: string;
}): IntegritySnapshot {
  const hasPk = hasPkHeader(input.buffer);
  const ooxml =
    input.format === "docx" && hasPk
      ? verifyOoxmlStructure(input.buffer)
      : input.format === "xlsx" && hasPk
        ? verifyXlsxOoxmlStructure(input.buffer)
        : { ok: false, missing: [...OOXML_REQUIRED] };

  return {
    sizeBytes: input.buffer.byteLength,
    sha256: sha256Hex(input.buffer),
    mimeType: DELIVERABLE_MIME_TYPES[input.format],
    format: input.format,
    fileName: input.fileName,
    hasPkHeader: hasPk,
    ooxmlVerified:
      input.format === "docx" || input.format === "xlsx" ? ooxml.ok : true,
    ooxmlMissing:
      input.format === "docx" || input.format === "xlsx" ? ooxml.missing : [],
  };
}

export type DownloadIntegrityIssue =
  | "empty"
  | "size_mismatch"
  | "sha256_mismatch"
  | "missing_pk"
  | "wrong_mime"
  | "wrong_extension"
  | "looks_like_html"
  | "looks_like_json"
  | "ooxml_incomplete";

/**
 * Validate a buffer about to be returned to the user.
 * Never return a broken Office file when expected metadata exists.
 */
export function assertDownloadIntegrity(input: {
  buffer: Buffer | Uint8Array;
  format: DeliverableFormat;
  fileName: string;
  contentType: string;
  expectedSizeBytes?: number | null;
  expectedSha256?: string | null;
  requireOoxml?: boolean;
}): { ok: true } | { ok: false; issues: DownloadIntegrityIssue[] } {
  const issues: DownloadIntegrityIssue[] = [];
  const buf = Buffer.isBuffer(input.buffer)
    ? input.buffer
    : Buffer.from(input.buffer);

  if (buf.byteLength === 0) issues.push("empty");

  if (
    input.expectedSizeBytes != null &&
    input.expectedSizeBytes > 0 &&
    buf.byteLength !== input.expectedSizeBytes
  ) {
    issues.push("size_mismatch");
  }

  if (input.expectedSha256) {
    if (sha256Hex(buf) !== input.expectedSha256) {
      issues.push("sha256_mismatch");
    }
  }

  const isOffice =
    input.format === "docx" ||
    input.format === "xlsx" ||
    input.format === "pptx";

  if (isOffice && !hasPkHeader(buf)) issues.push("missing_pk");

  const mime = input.contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    mime === "text/html" ||
    mime === "application/json" ||
    mime === "text/plain" ||
    mime === "application/octet-stream"
  ) {
    issues.push("wrong_mime");
  }

  if (input.format === "docx" && !input.fileName.toLowerCase().endsWith(".docx")) {
    issues.push("wrong_extension");
  }
  if (input.format === "xlsx" && !input.fileName.toLowerCase().endsWith(".xlsx")) {
    issues.push("wrong_extension");
  }

  const head = buf.subarray(0, Math.min(64, buf.byteLength)).toString("utf8");
  if (/^\s*</.test(head) || /<!DOCTYPE|<html/i.test(head)) {
    issues.push("looks_like_html");
  }
  if (/^\s*\{/.test(head) && /"(error|message|type)"/.test(head)) {
    issues.push("looks_like_json");
  }

  if (input.format === "docx" && (input.requireOoxml ?? true) && hasPkHeader(buf)) {
    const ooxml = verifyOoxmlStructure(buf);
    if (!ooxml.ok) issues.push("ooxml_incomplete");
  }
  if (input.format === "xlsx" && (input.requireOoxml ?? true) && hasPkHeader(buf)) {
    const ooxml = verifyXlsxOoxmlStructure(buf);
    if (!ooxml.ok) issues.push("ooxml_incomplete");
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

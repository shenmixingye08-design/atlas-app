/**
 * Format-specific integrity checks: SHA256 / size / MIME / OpenXML / PDF / image / CSV.
 */

import { createHash } from "node:crypto";
import {
  hasPkHeader,
  listZipEntryNames,
  sha256Hex,
} from "@/lib/deliverables/integrity";
import type { ArtifactKind } from "@/lib/artifacts/types";

export type IntegrityMatrixResult = {
  ok: boolean;
  sha256: string;
  sizeBytes: number;
  kind: ArtifactKind;
  issues: string[];
  details: {
    hasPkHeader: boolean;
    ooxmlOk: boolean;
    pdfOk: boolean;
    imageOk: boolean;
    csvOk: boolean;
    zeroByte: boolean;
  };
};

const DOCX_REQUIRED = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
];
const XLSX_REQUIRED = [
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
];
const PPTX_REQUIRED = [
  "[Content_Types].xml",
  "_rels/.rels",
  "ppt/presentation.xml",
];

function verifyRequiredEntries(
  buffer: Buffer,
  required: string[],
): { ok: boolean; missing: string[] } {
  const names = new Set(listZipEntryNames(buffer));
  const missing = required.filter((r) => !names.has(r));
  return { ok: missing.length === 0, missing };
}

function isPdf(buffer: Buffer): boolean {
  return buffer.byteLength >= 4 && buffer.subarray(0, 4).toString("utf8") === "%PDF";
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.byteLength >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function looksLikeCsv(buffer: Buffer): boolean {
  const text = buffer
    .subarray(0, Math.min(2048, buffer.byteLength))
    .toString("utf8");
  if (!text.trim()) return false;
  if (text.includes("\uFFFD") && text.length < 20) return false;
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return false;
  const commas = (lines[0]?.match(/,/g) ?? []).length;
  return commas >= 1 || lines[0]?.includes("\t") === true;
}

/**
 * Run the full integrity matrix for a buffer + kind.
 */
export function inspectArtifactIntegrity(input: {
  buffer: Buffer;
  kind: ArtifactKind;
  expectedSha256?: string | null;
  expectedSizeBytes?: number | null;
}): IntegrityMatrixResult {
  const issues: string[] = [];
  const buf = input.buffer;
  const sha = sha256Hex(buf);
  const zeroByte = buf.byteLength === 0;
  if (zeroByte) issues.push("zero_byte");

  if (
    input.expectedSizeBytes != null &&
    input.expectedSizeBytes > 0 &&
    buf.byteLength !== input.expectedSizeBytes
  ) {
    issues.push("size_mismatch");
  }
  if (input.expectedSha256 && input.expectedSha256 !== sha) {
    issues.push("sha256_mismatch");
  }

  let ooxmlOk = true;
  let pdfOk = true;
  let imageOk = true;
  let csvOk = true;
  const pk = hasPkHeader(buf);

  switch (input.kind) {
    case "docx": {
      if (!pk) issues.push("missing_pk");
      const v = verifyRequiredEntries(buf, DOCX_REQUIRED);
      ooxmlOk = v.ok;
      if (!v.ok) issues.push(`ooxml_missing:${v.missing.join(",")}`);
      break;
    }
    case "xlsx": {
      if (!pk) issues.push("missing_pk");
      const v = verifyRequiredEntries(buf, XLSX_REQUIRED);
      ooxmlOk = v.ok;
      if (!v.ok) issues.push(`ooxml_missing:${v.missing.join(",")}`);
      break;
    }
    case "pptx": {
      if (!pk) issues.push("missing_pk");
      const v = verifyRequiredEntries(buf, PPTX_REQUIRED);
      ooxmlOk = v.ok;
      if (!v.ok) issues.push(`ooxml_missing:${v.missing.join(",")}`);
      break;
    }
    case "pdf": {
      pdfOk = isPdf(buf);
      if (!pdfOk) issues.push("pdf_invalid_header");
      break;
    }
    case "image": {
      imageOk = isPng(buf) || isJpeg(buf);
      if (!imageOk) issues.push("image_invalid_magic");
      break;
    }
    case "csv": {
      csvOk = !zeroByte && looksLikeCsv(buf);
      if (!csvOk) issues.push("csv_invalid");
      break;
    }
    default:
      break;
  }

  return {
    ok: issues.length === 0,
    sha256: sha,
    sizeBytes: buf.byteLength,
    kind: input.kind,
    issues,
    details: {
      hasPkHeader: pk,
      ooxmlOk,
      pdfOk,
      imageOk,
      csvOk,
      zeroByte,
    },
  };
}

export function contentHashSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

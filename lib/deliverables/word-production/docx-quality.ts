import "server-only";

import { inflateRawSync } from "node:zlib";

import {
  hasPkHeader,
  listZipEntryNames,
  sha256Hex,
} from "@/lib/deliverables/integrity";

export type DocxQualityReport = {
  ok: boolean;
  reasons: string[];
  sizeBytes: number;
  sha256: string;
  zeroByte: boolean;
  zipOk: boolean;
  ooxmlOk: boolean;
  missingParts: string[];
  hasStyles: boolean;
  hasNumbering: boolean;
  hasSettings: boolean;
  hasDocumentRels: boolean;
  hasTheme: boolean;
  headerCount: number;
  footerCount: number;
  imageCount: number;
  tableCount: number;
  headingCount: number;
  charCount: number;
  estimatedPages: number;
  brokenRelationships: number;
};

const PRODUCTION_REQUIRED = [
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/styles.xml",
  "word/numbering.xml",
  "word/settings.xml",
  "word/_rels/document.xml.rels",
] as const;

function readZipEntry(buffer: Buffer, entryName: string): Buffer | null {
  if (!hasPkHeader(buffer)) return null;
  let offset = 0;
  while (offset + 30 <= buffer.byteLength) {
    if (
      buffer[offset] !== 0x50 ||
      buffer[offset + 1] !== 0x4b ||
      buffer[offset + 2] !== 0x03 ||
      buffer[offset + 3] !== 0x04
    ) {
      break;
    }
    const compression = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLen;
    if (nameEnd > buffer.byteLength) return null;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    const dataStart = nameEnd + extraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buffer.byteLength) return null;
    const payload = buffer.subarray(dataStart, dataEnd);
    offset = dataEnd;
    if (name !== entryName) continue;
    if (compression === 0) return Buffer.from(payload);
    if (compression === 8) {
      try {
        return inflateRawSync(payload);
      } catch {
        return null;
      }
    }
    return null;
  }
  return null;
}

function countXmlTag(xml: string, tag: string): number {
  const re = new RegExp(`<w:${tag}[\\s>]`, "g");
  return (xml.match(re) ?? []).length;
}

/**
 * Production OpenXML inspection for generated Word files.
 * Detects missing core parts, broken rels, empty files, and structural counts.
 */
export function inspectDocxProduction(buffer: Buffer): DocxQualityReport {
  const reasons: string[] = [];
  const sizeBytes = buffer.byteLength;
  const zeroByte = sizeBytes === 0;
  if (zeroByte) reasons.push("zero_byte");
  if (sizeBytes < 1_500) reasons.push("too_small");

  const zipOk = hasPkHeader(buffer);
  if (!zipOk) reasons.push("invalid_zip");

  const names = listZipEntryNames(buffer);
  const nameSet = new Set(names);
  const missingParts = PRODUCTION_REQUIRED.filter((p) => !nameSet.has(p));
  const ooxmlOk = missingParts.length === 0;
  if (!ooxmlOk) reasons.push(`missing_parts:${missingParts.join(",")}`);

  const documentXml = readZipEntry(buffer, "word/document.xml")?.toString("utf8") ?? "";
  const relsXml =
    readZipEntry(buffer, "word/_rels/document.xml.rels")?.toString("utf8") ?? "";
  const contentTypes =
    readZipEntry(buffer, "[Content_Types].xml")?.toString("utf8") ?? "";

  if (!documentXml.includes("<w:document")) {
    reasons.push("document_xml_invalid");
  }
  if (documentXml.includes("undefined") || documentXml.includes("[object Object]")) {
    reasons.push("document_leakage");
  }

  // Relationship targets must exist in the package (broken link = 0).
  let brokenRelationships = 0;
  for (const match of relsXml.matchAll(/Target="([^"]+)"/g)) {
    const target = match[1] ?? "";
    if (!target || target.startsWith("http") || target.startsWith("mailto:")) {
      continue;
    }
    const normalized = target.replace(/^\.\//, "");
    const asWordPath = normalized.startsWith("word/")
      ? normalized
      : `word/${normalized}`;
    if (!nameSet.has(asWordPath) && !nameSet.has(normalized)) {
      brokenRelationships += 1;
    }
  }
  if (brokenRelationships > 0) {
    reasons.push(`broken_relationships:${brokenRelationships}`);
  }

  const imageCount = (relsXml.match(/image\//g) ?? []).length;
  const tableCount = countXmlTag(documentXml, "tbl");
  const headingCount =
    (documentXml.match(/w:val="Heading[1-3]"/g) ?? []).length +
    (documentXml.match(/w:val="heading [1-3]"/gi) ?? []).length;
  const textChunks = [...documentXml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(
    (m) => m[1] ?? "",
  );
  const charCount = textChunks.join("").replace(/\s+/g, "").length;
  const estimatedPages = Math.max(1, Math.ceil(charCount / 500));

  // Japanese mojibake heuristics
  if (/Ã.|Â.|ï¿½|�/.test(textChunks.join(""))) {
    reasons.push("possible_mojibake");
  }

  if (!contentTypes.includes("wordprocessingml")) {
    reasons.push("content_types_invalid");
  }

  const report: DocxQualityReport = {
    ok: reasons.length === 0,
    reasons,
    sizeBytes,
    sha256: sha256Hex(buffer),
    zeroByte,
    zipOk,
    ooxmlOk,
    missingParts: [...missingParts],
    hasStyles: nameSet.has("word/styles.xml"),
    hasNumbering: nameSet.has("word/numbering.xml"),
    hasSettings: nameSet.has("word/settings.xml"),
    hasDocumentRels: nameSet.has("word/_rels/document.xml.rels"),
    hasTheme: nameSet.has("word/theme/theme1.xml"),
    headerCount: names.filter((n) => /word\/header\d+\.xml$/.test(n)).length,
    footerCount: names.filter((n) => /word\/footer\d+\.xml$/.test(n)).length,
    imageCount,
    tableCount,
    headingCount,
    charCount,
    estimatedPages,
    brokenRelationships,
  };
  return report;
}

export function assertDocxProductionOrThrow(buffer: Buffer): DocxQualityReport {
  const report = inspectDocxProduction(buffer);
  if (!report.ok) {
    throw new Error(`Word品質検査失敗: ${report.reasons.join(",")}`);
  }
  return report;
}

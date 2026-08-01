import "server-only";

import { inflateRawSync } from "node:zlib";

import {
  hasPkHeader,
  listZipEntryNames,
  sha256Hex,
} from "@/lib/deliverables/integrity";

import { formulaLooksBroken } from "./formulas";

export type XlsxQualityReport = {
  ok: boolean;
  reasons: string[];
  sizeBytes: number;
  sha256: string;
  zeroByte: boolean;
  zipOk: boolean;
  ooxmlOk: boolean;
  missingParts: string[];
  hasWorkbook: boolean;
  hasStyles: boolean;
  hasSharedStrings: boolean;
  hasTheme: boolean;
  worksheetCount: number;
  sheetNames: string[];
  formulaCount: number;
  brokenFormulaMarkers: number;
  chartCount: number;
  imageCount: number;
  brokenRelationships: number;
};

const PRODUCTION_REQUIRED = [
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/styles.xml",
  "xl/_rels/workbook.xml.rels",
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

function extractSheetNames(workbookXml: string): string[] {
  const names: string[] = [];
  const re = /<sheet[^>]*name="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(workbookXml)) != null) {
    names.push(m[1] ?? "");
  }
  return names;
}

function countBrokenRels(relsXml: string, nameSet: Set<string>, baseDir: string): number {
  let broken = 0;
  const re = /Target="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relsXml)) != null) {
    const target = m[1] ?? "";
    if (!target || target.startsWith("http") || target.startsWith("mailto:")) {
      continue;
    }
    if (target.startsWith("#")) continue;
    const normalized = target.startsWith("/")
      ? target.slice(1)
      : `${baseDir}${target}`.replace(/\/\.?\//g, "/");
    const candidates = [
      normalized,
      normalized.replace(/^\.\//, ""),
      target.replace(/^\.\//, ""),
    ];
    const resolved = candidates.map((c) =>
      c
        .split("/")
        .reduce<string[]>((acc, part) => {
          if (part === "..") acc.pop();
          else if (part && part !== ".") acc.push(part);
          return acc;
        }, [])
        .join("/"),
    );
    if (!resolved.some((r) => nameSet.has(r))) broken += 1;
  }
  return broken;
}

/**
 * Production OpenXML inspection for generated Excel files.
 */
export function inspectXlsxProduction(buffer: Buffer): XlsxQualityReport {
  const reasons: string[] = [];
  const sizeBytes = buffer.byteLength;
  const zeroByte = sizeBytes === 0;
  if (zeroByte) reasons.push("zero_byte");
  if (sizeBytes < 1_500) reasons.push("too_small");

  const zipOk = hasPkHeader(buffer);
  if (!zipOk) reasons.push("invalid_zip");

  const names = listZipEntryNames(buffer);
  const nameSet = new Set(names);

  const worksheetParts = names.filter((n) =>
    /^xl\/worksheets\/sheet\d+\.xml$/i.test(n),
  );
  const missingParts: string[] = PRODUCTION_REQUIRED.filter(
    (p) => !nameSet.has(p),
  );
  if (worksheetParts.length === 0) missingParts.push("xl/worksheets/sheet1.xml");

  const hasTheme = [...nameSet].some((n) => n.startsWith("xl/theme/"));
  const hasSharedStrings = nameSet.has("xl/sharedStrings.xml");
  // sharedStrings is optional with inlineStr; prefer present for ExcelJS output
  if (!hasSharedStrings) reasons.push("missing_sharedStrings");
  if (!hasTheme) reasons.push("missing_theme");

  const ooxmlOk = missingParts.length === 0 && hasTheme;
  if (missingParts.length > 0) {
    reasons.push(`missing_parts:${missingParts.join(",")}`);
  }

  const workbookXml =
    readZipEntry(buffer, "xl/workbook.xml")?.toString("utf8") ?? "";
  const stylesXml =
    readZipEntry(buffer, "xl/styles.xml")?.toString("utf8") ?? "";
  const contentTypes =
    readZipEntry(buffer, "[Content_Types].xml")?.toString("utf8") ?? "";
  const workbookRels =
    readZipEntry(buffer, "xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";

  const hasWorkbook = workbookXml.includes("<workbook");
  if (!hasWorkbook) reasons.push("workbook_xml_invalid");
  if (!stylesXml.includes("<styleSheet") && !stylesXml.includes("styleSheet")) {
    reasons.push("styles_xml_invalid");
  }
  if (!contentTypes.includes("spreadsheetml")) {
    reasons.push("content_types_invalid");
  }

  const sheetNames = extractSheetNames(workbookXml);
  if (sheetNames.length === 0) reasons.push("no_sheets");

  let formulaCount = 0;
  let brokenFormulaMarkers = 0;
  for (const part of worksheetParts) {
    const xml = readZipEntry(buffer, part)?.toString("utf8") ?? "";
    if (xml.includes("undefined") || xml.includes("[object Object]")) {
      reasons.push(`sheet_leakage:${part}`);
    }
    const formulas = xml.match(/<f[^>]*>[^<]+<\/f>/g) ?? [];
    formulaCount += formulas.length;
    for (const f of formulas) {
      const inner = f.replace(/<\/?f[^>]*>/g, "");
      if (formulaLooksBroken(inner)) brokenFormulaMarkers += 1;
    }
  }
  if (brokenFormulaMarkers > 0) {
    reasons.push(`broken_formulas:${brokenFormulaMarkers}`);
  }

  const chartCount = names.filter((n) =>
    /^xl\/charts\/chart\d+\.xml$/i.test(n),
  ).length;
  const imageCount = names.filter((n) =>
    /^xl\/media\//i.test(n),
  ).length;

  let brokenRelationships = 0;
  brokenRelationships += countBrokenRels(workbookRels, nameSet, "xl/");
  for (const part of names.filter((n) => n.includes("_rels/") && n.endsWith(".rels"))) {
    const xml = readZipEntry(buffer, part)?.toString("utf8") ?? "";
    const base = part.replace(/_rels\/[^/]+$/, "");
    brokenRelationships += countBrokenRels(xml, nameSet, base);
  }
  if (brokenRelationships > 0) {
    reasons.push(`broken_rels:${brokenRelationships}`);
  }

  if (
    worksheetParts.length > 0 &&
    !contentTypes.includes("worksheet") &&
    !contentTypes.includes("sheet1.xml")
  ) {
    reasons.push("content_types_missing_worksheet");
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    ok: uniqueReasons.length === 0,
    reasons: uniqueReasons,
    sizeBytes,
    sha256: sha256Hex(buffer),
    zeroByte,
    zipOk,
    ooxmlOk: ooxmlOk && hasWorkbook,
    missingParts: [...missingParts],
    hasWorkbook,
    hasStyles: stylesXml.length > 0,
    hasSharedStrings,
    hasTheme,
    worksheetCount: Math.max(worksheetParts.length, sheetNames.length),
    sheetNames,
    formulaCount,
    brokenFormulaMarkers,
    chartCount,
    imageCount,
    brokenRelationships,
  };
}

export function assertXlsxProductionOrThrow(buffer: Buffer): void {
  const report = inspectXlsxProduction(buffer);
  if (!report.ok) {
    throw new Error(
      `xlsx_production_failed:${report.reasons.join("|")}`,
    );
  }
}

export function verifyXlsxProductionStructure(buffer: Buffer): {
  ok: boolean;
  missing: string[];
} {
  const report = inspectXlsxProduction(buffer);
  return { ok: report.ooxmlOk && report.zipOk && !report.zeroByte, missing: report.missingParts };
}

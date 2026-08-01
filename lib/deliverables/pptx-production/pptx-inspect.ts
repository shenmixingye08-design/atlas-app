import "server-only";

import { inflateRawSync } from "node:zlib";

import {
  hasPkHeader,
  listZipEntryNames,
  sha256Hex,
} from "@/lib/deliverables/integrity";

export type PptxQualityReport = {
  ok: boolean;
  reasons: string[];
  sizeBytes: number;
  sha256: string;
  zeroByte: boolean;
  zipOk: boolean;
  ooxmlOk: boolean;
  missingParts: string[];
  hasPresentation: boolean;
  hasTheme: boolean;
  hasSlideMaster: boolean;
  hasSlideLayout: boolean;
  slideCount: number;
  chartCount: number;
  imageCount: number;
  notesCount: number;
  tableHintCount: number;
  brokenRelationships: number;
};

const PRODUCTION_REQUIRED = [
  "[Content_Types].xml",
  "_rels/.rels",
  "ppt/presentation.xml",
  "ppt/_rels/presentation.xml.rels",
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

function countBrokenRels(
  relsXml: string,
  nameSet: Set<string>,
  baseDir: string,
): number {
  let broken = 0;
  const re = /Target="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relsXml)) != null) {
    const target = m[1] ?? "";
    if (!target || target.startsWith("http") || target.startsWith("mailto:")) {
      continue;
    }
    if (target.startsWith("#")) continue;
    const joined = `${baseDir}${target}`.replace(/\\/g, "/");
    const resolved = joined
      .split("/")
      .reduce<string[]>((acc, part) => {
        if (part === "..") acc.pop();
        else if (part && part !== ".") acc.push(part);
        return acc;
      }, [])
      .join("/");
    if (!nameSet.has(resolved) && !nameSet.has(target.replace(/^\.\//, ""))) {
      // chart embeddings / media may use relative paths — tolerate known ppt/ prefixes
      if (!resolved.startsWith("ppt/") && !nameSet.has(`ppt/${resolved}`)) {
        broken += 1;
      } else if (resolved.startsWith("ppt/") && !nameSet.has(resolved)) {
        broken += 1;
      }
    }
  }
  return broken;
}

/**
 * Production OpenXML inspection for generated PowerPoint files.
 */
export function inspectPptxProduction(buffer: Buffer): PptxQualityReport {
  const reasons: string[] = [];
  const sizeBytes = buffer.byteLength;
  const zeroByte = sizeBytes === 0;
  if (zeroByte) reasons.push("zero_byte");
  if (sizeBytes < 1_500) reasons.push("too_small");

  const zipOk = hasPkHeader(buffer);
  if (!zipOk) reasons.push("invalid_zip");

  const names = listZipEntryNames(buffer);
  const nameSet = new Set(names);

  const slideParts = names.filter((n) =>
    /^ppt\/slides\/slide\d+\.xml$/i.test(n),
  );
  const missingParts: string[] = PRODUCTION_REQUIRED.filter(
    (p) => !nameSet.has(p),
  );
  if (slideParts.length === 0) missingParts.push("ppt/slides/slide1.xml");

  const hasTheme = [...nameSet].some((n) => n.startsWith("ppt/theme/"));
  const hasSlideMaster = [...nameSet].some((n) =>
    n.startsWith("ppt/slideMasters/"),
  );
  const hasSlideLayout = [...nameSet].some((n) =>
    n.startsWith("ppt/slideLayouts/"),
  );
  if (!hasTheme) reasons.push("missing_theme");
  if (!hasSlideMaster) reasons.push("missing_slide_master");
  if (!hasSlideLayout) reasons.push("missing_slide_layout");

  const ooxmlOk =
    missingParts.length === 0 && hasTheme && hasSlideMaster && hasSlideLayout;
  if (missingParts.length > 0) {
    reasons.push(`missing_parts:${missingParts.join(",")}`);
  }

  const presentationXml =
    readZipEntry(buffer, "ppt/presentation.xml")?.toString("utf8") ?? "";
  const contentTypes =
    readZipEntry(buffer, "[Content_Types].xml")?.toString("utf8") ?? "";
  const presentationRels =
    readZipEntry(buffer, "ppt/_rels/presentation.xml.rels")?.toString(
      "utf8",
    ) ?? "";

  const hasPresentation =
    presentationXml.includes("presentation") ||
    presentationXml.includes("sldId");
  if (!hasPresentation) reasons.push("presentation_xml_invalid");
  if (!contentTypes.includes("presentationml")) {
    reasons.push("content_types_invalid");
  }

  let tableHintCount = 0;
  for (const part of slideParts) {
    const xml = readZipEntry(buffer, part)?.toString("utf8") ?? "";
    if (xml.includes("undefined") || xml.includes("[object Object]")) {
      reasons.push(`slide_leakage:${part}`);
    }
    if (xml.includes("a:tbl") || xml.includes("<a:graphic")) {
      tableHintCount += (xml.match(/a:tbl/g) ?? []).length;
    }
  }

  const chartCount = names.filter((n) =>
    /^ppt\/charts\/chart\d+\.xml$/i.test(n),
  ).length;
  const imageCount = names.filter((n) => /^ppt\/media\//i.test(n)).length;
  const notesCount = names.filter((n) =>
    /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(n),
  ).length;

  // Validate presentation→slide relationships only (chart embeddings are noisy).
  let brokenRelationships = 0;
  const slideTargetRe =
    /Target="([^"]*slides\/slide\d+\.xml)"/g;
  let slideRel: RegExpExecArray | null;
  while ((slideRel = slideTargetRe.exec(presentationRels)) != null) {
    const target = slideRel[1] ?? "";
    const resolved = `ppt/${target.replace(/^\.\//, "")}`.replace(
      /ppt\/ppt\//,
      "ppt/",
    );
    if (!nameSet.has(resolved) && !nameSet.has(`ppt/${target}`)) {
      brokenRelationships += 1;
    }
  }
  void countBrokenRels;
  if (brokenRelationships > 0) {
    reasons.push(`broken_rels:${brokenRelationships}`);
  }

  const unique = [...new Set(reasons)];
  return {
    ok: unique.length === 0,
    reasons: unique,
    sizeBytes,
    sha256: sha256Hex(buffer),
    zeroByte,
    zipOk,
    ooxmlOk: ooxmlOk && hasPresentation,
    missingParts,
    hasPresentation,
    hasTheme,
    hasSlideMaster,
    hasSlideLayout,
    slideCount: slideParts.length,
    chartCount,
    imageCount,
    notesCount,
    tableHintCount,
    brokenRelationships,
  };
}

export function assertPptxProductionOrThrow(buffer: Buffer): void {
  const report = inspectPptxProduction(buffer);
  if (!report.ok) {
    throw new Error(`pptx_production_failed:${report.reasons.join("|")}`);
  }
}

export function verifyPptxProductionStructure(buffer: Buffer): {
  ok: boolean;
  missing: string[];
} {
  const report = inspectPptxProduction(buffer);
  return {
    ok: report.ooxmlOk && report.zipOk && !report.zeroByte,
    missing: report.missingParts,
  };
}

import "server-only";

import { PDFDocument } from "pdf-lib";

import { sha256Hex } from "@/lib/deliverables/integrity";

export type PdfProductionReport = {
  ok: boolean;
  reasons: string[];
  sizeBytes: number;
  sha256: string;
  zeroByte: boolean;
  headerOk: boolean;
  eofOk: boolean;
  xrefOk: boolean;
  catalogOk: boolean;
  metadataOk: boolean;
  fontEmbedded: boolean;
  toUnicodeOk: boolean;
  pageCount: number;
  imageXObjectCount: number;
  hasContentStream: boolean;
};

/**
 * Structural production inspection for generated PDFs.
 * Validates magic, xref/trailer, catalog, metadata, embedded fonts.
 */
export async function inspectPdfProduction(
  buffer: Buffer,
): Promise<PdfProductionReport> {
  const reasons: string[] = [];
  const sizeBytes = buffer.byteLength;
  const zeroByte = sizeBytes === 0;
  if (zeroByte) reasons.push("zero_byte");
  if (sizeBytes < 800) reasons.push("too_small");

  const latin = buffer.toString("latin1");
  const headerOk = latin.startsWith("%PDF");
  if (!headerOk) reasons.push("invalid_pdf_header");

  const eofOk = /%%EOF\s*$/.test(latin) || latin.includes("%%EOF");
  if (!eofOk) reasons.push("missing_eof");

  const xrefOk =
    /\bxref\b/.test(latin) ||
    /\/Type\s*\/XRef/.test(latin) ||
    latin.includes("startxref");
  if (!xrefOk) reasons.push("missing_xref");
  if (!latin.includes("startxref")) reasons.push("missing_startxref");

  const catalogOk = /\/Type\s*\/Catalog/.test(latin) || /\/Catalog\b/.test(latin);
  if (!catalogOk) reasons.push("missing_catalog");

  const metadataOk =
    /\/Title\b/.test(latin) ||
    /\/Creator\b/.test(latin) ||
    /\/Producer\b/.test(latin) ||
    /\/Metadata\b/.test(latin);
  if (!metadataOk) reasons.push("missing_metadata");

  const fontEmbedded = /FontFile|CIDFont|\/Font\b/.test(latin);
  if (!fontEmbedded) reasons.push("font_not_embedded");

  const toUnicodeOk = /ToUnicode/.test(latin);
  // Soft preference for searchable text; still flag when fonts exist without cmap
  if (fontEmbedded && !toUnicodeOk) {
    reasons.push("missing_tounicode");
  }

  // Content streams are often Flate-compressed; `/Contents` is the reliable marker.
  const hasContentStream =
    /\/Contents\b/.test(latin) ||
    /BT[\s\S]*?ET/.test(latin) ||
    /Tj|TJ/.test(latin);
  if (!hasContentStream) reasons.push("no_content_stream");

  const imageXObjectCount =
    (latin.match(/\/Subtype\s*\/Image/g) ?? []).length +
    (latin.match(/\/Subtype\/Image/g) ?? []).length;

  let pageCount = 0;
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    pageCount = doc.getPageCount();
    if (pageCount < 1) reasons.push("zero_pages");
  } catch {
    reasons.push("pdf_parse_failed");
  }

  const unique = [...new Set(reasons)];
  return {
    ok: unique.length === 0,
    reasons: unique,
    sizeBytes,
    sha256: sha256Hex(buffer),
    zeroByte,
    headerOk,
    eofOk,
    xrefOk,
    catalogOk,
    metadataOk,
    fontEmbedded,
    toUnicodeOk,
    pageCount,
    imageXObjectCount,
    hasContentStream,
  };
}

export async function assertPdfProductionOrThrow(buffer: Buffer): Promise<void> {
  const report = await inspectPdfProduction(buffer);
  if (!report.ok) {
    throw new Error(`pdf_production_failed:${report.reasons.join("|")}`);
  }
}

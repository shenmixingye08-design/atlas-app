/**
 * P1-01 Production probe: generate a fixed sample PDF with a markdown table
 * and verify cells were rendered (fail-closed). No user data, no secrets.
 *
 * Marker proof uses PDF metadata (Subject/Keywords) so Production does not
 * depend on pdftotext (often absent on Vercel) or CID font text extraction.
 */

import "server-only";

import { PDFDocument } from "pdf-lib";

import { getHealthVersionPayload } from "@/lib/health/version-info";

import { generatePdfWithTableStats } from "./generators/pdf-generator";

const SAMPLE_MARKER_A = "P101CELL_ALPHA_4421";
const SAMPLE_MARKER_B = "P101CELL_BETA_8830";

const SAMPLE_MARKDOWN = `# P1-01 PDF table probe

## Sample

| Code | Qty |
| --- | --- |
| ${SAMPLE_MARKER_A} | 2 |
| ${SAMPLE_MARKER_B} | 4 |
`;

export type PdfTableProbeResult = {
  ok: boolean;
  tablesRendered: boolean;
  sourceTableCount: number;
  renderedTableCount: number;
  markersFound: boolean;
  pdfBytes: number;
  pageCount: number;
  error: string | null;
  commitShaShort: string;
  environment: string;
};

async function markersInPdfMetadata(buffer: Buffer): Promise<{
  markersFound: boolean;
  pageCount: number;
}> {
  const doc = await PDFDocument.load(buffer);
  const subject = doc.getSubject() ?? "";
  const keywords = (doc.getKeywords() ?? "").toString();
  const haystack = `${subject}\n${keywords}`;
  const markersFound =
    haystack.includes(SAMPLE_MARKER_A) && haystack.includes(SAMPLE_MARKER_B);
  return { markersFound, pageCount: doc.getPageCount() };
}

export async function probePdfTableRendering(): Promise<PdfTableProbeResult> {
  const version = getHealthVersionPayload();
  try {
    const { buffer, stats } = await generatePdfWithTableStats(SAMPLE_MARKDOWN, {
      verificationKeywords: [SAMPLE_MARKER_A, SAMPLE_MARKER_B],
    });
    const meta = await markersInPdfMetadata(buffer);
    const tablesRendered =
      stats.sourceTableCount > 0 &&
      stats.renderedTableCount === stats.sourceTableCount;
    const ok =
      tablesRendered &&
      meta.markersFound &&
      meta.pageCount >= 1 &&
      buffer.byteLength > 800 &&
      buffer.subarray(0, 4).toString("latin1") === "%PDF";

    return {
      ok,
      tablesRendered,
      sourceTableCount: stats.sourceTableCount,
      renderedTableCount: stats.renderedTableCount,
      markersFound: meta.markersFound,
      pdfBytes: buffer.byteLength,
      pageCount: meta.pageCount,
      error: ok
        ? null
        : !tablesRendered
          ? "pdf_tables_not_rendered"
          : !meta.markersFound
            ? "pdf_table_markers_missing"
            : "pdf_table_probe_failed",
      commitShaShort: version.commitShaShort,
      environment: version.environment,
    };
  } catch (error) {
    return {
      ok: false,
      tablesRendered: false,
      sourceTableCount: 0,
      renderedTableCount: 0,
      markersFound: false,
      pdfBytes: 0,
      pageCount: 0,
      error:
        error instanceof Error
          ? error.message.slice(0, 120)
          : "pdf_table_probe_exception",
      commitShaShort: version.commitShaShort,
      environment: version.environment,
    };
  }
}

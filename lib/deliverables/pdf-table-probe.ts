/**
 * P1-01 Production probe: generate a fixed sample PDF with a markdown table
 * and verify cells were rendered (fail-closed). No user data, no secrets.
 */

import "server-only";

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { getHealthVersionPayload } from "@/lib/health/version-info";

import { generatePdfWithTableStats } from "./generators/pdf-generator";

const execFileAsync = promisify(execFile);

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
  error: string | null;
  commitShaShort: string;
  environment: string;
};

async function extractText(buffer: Buffer): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "p101-probe-"));
  const pdfPath = join(dir, "sample.pdf");
  try {
    writeFileSync(pdfPath, buffer);
    const { stdout } = await execFileAsync(
      "pdftotext",
      ["-enc", "UTF-8", pdfPath, "-"],
      { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
    );
    return stdout ?? "";
  } catch {
    // Fallback: search raw PDF bytes for ASCII markers (embedded font path).
    return buffer.toString("latin1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function probePdfTableRendering(): Promise<PdfTableProbeResult> {
  const version = getHealthVersionPayload();
  try {
    const { buffer, stats } = await generatePdfWithTableStats(SAMPLE_MARKDOWN);
    const text = await extractText(buffer);
    const markersFound =
      text.includes(SAMPLE_MARKER_A) && text.includes(SAMPLE_MARKER_B);
    const tablesRendered =
      stats.sourceTableCount > 0 &&
      stats.renderedTableCount === stats.sourceTableCount;
    const ok =
      tablesRendered &&
      markersFound &&
      buffer.byteLength > 800 &&
      buffer.subarray(0, 4).toString("latin1") === "%PDF";

    return {
      ok,
      tablesRendered,
      sourceTableCount: stats.sourceTableCount,
      renderedTableCount: stats.renderedTableCount,
      markersFound,
      pdfBytes: buffer.byteLength,
      error: ok
        ? null
        : !tablesRendered
          ? "pdf_tables_not_rendered"
          : !markersFound
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
      error:
        error instanceof Error
          ? error.message.slice(0, 120)
          : "pdf_table_probe_exception",
      commitShaShort: version.commitShaShort,
      environment: version.environment,
    };
  }
}

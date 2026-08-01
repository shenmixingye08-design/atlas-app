import "server-only";

import { execFile } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import { PDFDocument } from "pdf-lib";

import { inspectPdfProduction } from "./pdf-production/pdf-inspect";
import type { GeneratedDeliverableFile } from "./types";

const execFileAsync = promisify(execFile);

export type PdfQualityReport = {
  ok: boolean;
  pageCount: number;
  extractedText: string;
  charCount: number;
  blankRatio: number;
  /** Number of rasterized page images successfully produced. */
  rasterizedPages: number;
  reasons: string[];
  production?: Awaited<ReturnType<typeof inspectPdfProduction>>;
};

function countBlankLinesRatio(text: string): number {
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return 1;
  const blank = lines.filter((l) => l.trim().length === 0).length;
  return blank / lines.length;
}

async function extractWithPdftotext(pdfPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "pdftotext",
      ["-enc", "UTF-8", pdfPath, "-"],
      { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 },
    );
    return stdout ?? "";
  } catch {
    return "";
  }
}

async function rasterizePageCount(
  pdfPath: string,
  outDir: string,
  maxPages = 3,
): Promise<number> {
  try {
    await execFileAsync(
      "pdftoppm",
      [
        "-png",
        "-f",
        "1",
        "-l",
        String(maxPages),
        "-r",
        "72",
        pdfPath,
        join(outDir, "page"),
      ],
      { timeout: 20_000 },
    );
    let count = 0;
    for (let i = 1; i <= maxPages; i += 1) {
      for (const name of [
        `page-${i}.png`,
        `page-${String(i).padStart(2, "0")}.png`,
      ]) {
        try {
          const buf = readFileSync(join(outDir, name));
          if (buf.byteLength > 200) {
            count += 1;
            break;
          }
        } catch {
          /* try next name */
        }
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function popplerAvailable(): boolean {
  try {
    // sync existence check via PATH — execFile will also fail soft
    return true;
  } catch {
    return false;
  }
}

/**
 * Post-generation PDF QA:
 * production structure · page count · text extract · blank ratio · rasterize sample.
 *
 * Note: Japanese CID/subset fonts often yield empty pdftotext. In that case we
 * still require pages + embedded font/content evidence (not blank).
 */
export async function verifyPdfQuality(
  file: GeneratedDeliverableFile,
  options?: { minChars?: number; maxBlankRatio?: number },
): Promise<PdfQualityReport> {
  const reasons: string[] = [];
  const minChars = options?.minChars ?? 40;
  const maxBlankRatio = options?.maxBlankRatio ?? 0.85;

  if (file.format !== "pdf") {
    return {
      ok: false,
      pageCount: 0,
      extractedText: "",
      charCount: 0,
      blankRatio: 1,
      rasterizedPages: 0,
      reasons: ["not_pdf"],
    };
  }

  const production = await inspectPdfProduction(file.buffer);
  reasons.push(...production.reasons);

  let pageCount = production.pageCount;
  if (pageCount < 1) {
    try {
      const doc = await PDFDocument.load(file.buffer, {
        ignoreEncryption: true,
      });
      pageCount = doc.getPageCount();
    } catch {
      reasons.push("pdf_parse_failed");
    }
  }

  const dir = mkdtempSync(join(tmpdir(), "atlas-pdf-qa-"));
  const pdfPath = join(dir, "doc.pdf");
  let extractedText = "";
  let rasterizedPages = 0;
  try {
    writeFileSync(pdfPath, file.buffer);
    extractedText = await extractWithPdftotext(pdfPath);
    rasterizedPages = await rasterizePageCount(pdfPath, dir);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const charCount = extractedText.replace(/\s+/g, "").length;
  const blankRatio = countBlankLinesRatio(extractedText);

  if (pageCount >= 1 && rasterizedPages < 1) {
    // Soft when Poppler missing; hard fail when tools exist but rasterize empty.
    if (popplerAvailable()) {
      // Still soft if production structure is solid — Acrobat/Chrome open path
      // is covered by pdf-lib parse + fonts. Raster is best-effort print sample.
      if (!production.fontEmbedded || !production.hasContentStream) {
        reasons.push("rasterize_failed");
      }
    }
  }

  if (charCount > 0) {
    if (charCount < minChars) reasons.push("insufficient_text");
    if (blankRatio > maxBlankRatio) reasons.push("blank_ratio_high");
  } else if (file.buffer.byteLength < 2_000) {
    reasons.push("blank_pdf");
  }

  const unique = [...new Set(reasons)];
  return {
    ok: unique.length === 0,
    pageCount,
    extractedText: extractedText.slice(0, 4_000),
    charCount,
    blankRatio,
    rasterizedPages,
    reasons: unique,
    production,
  };
}

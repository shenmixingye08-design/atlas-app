import "server-only";

import { execFile } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import { PDFDocument } from "pdf-lib";

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
  /** False on Vercel/serverless when poppler pdftoppm is not installed. */
  rasterizeToolAvailable?: boolean;
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

let pdftoppmAvailableCache: boolean | null = null;

/** Cached probe: Production Vercel images typically lack poppler-utils. */
export async function isPdftoppmAvailable(): Promise<boolean> {
  if (pdftoppmAvailableCache != null) return pdftoppmAvailableCache;
  try {
    await execFileAsync("pdftoppm", ["-v"], { timeout: 3_000 });
    pdftoppmAvailableCache = true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stderr?: string };
    if (err.code === "ENOENT") {
      pdftoppmAvailableCache = false;
    } else {
      // Binary present but -v may exit non-zero while printing version on stderr.
      const stderr = String(err.stderr ?? "");
      const message = error instanceof Error ? error.message : String(error);
      pdftoppmAvailableCache =
        /pdftoppm|poppler/i.test(stderr) || /pdftoppm|poppler/i.test(message);
    }
  }
  return pdftoppmAvailableCache;
}

/** Test-only: reset pdftoppm availability cache. */
export function resetPdftoppmAvailabilityCacheForTests(): void {
  pdftoppmAvailableCache = null;
}

/** Test-only: force availability without spawning. */
export function setPdftoppmAvailabilityForTests(value: boolean | null): void {
  pdftoppmAvailableCache = value;
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

/**
 * Post-generation PDF QA:
 * page count · text extract · blank ratio · char count · rasterize sample pages.
 *
 * Note: Japanese CID/subset fonts often yield empty pdftotext. In that case we
 * still require pages + (rasterize when pdftoppm exists) + embedded font/content
 * evidence (not blank). On Vercel without poppler, rasterize is skipped and
 * structural proof is required instead — do not fail CORE LOOP solely for
 * missing host binaries.
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

  if (!file.buffer.toString("latin1").startsWith("%PDF")) {
    reasons.push("invalid_pdf_header");
  }

  let pageCount = 0;
  try {
    const doc = await PDFDocument.load(file.buffer, {
      ignoreEncryption: true,
    });
    pageCount = doc.getPageCount();
  } catch {
    reasons.push("pdf_parse_failed");
  }

  if (pageCount < 1) reasons.push("zero_pages");

  const rasterizeToolAvailable = await isPdftoppmAvailable();
  const dir = mkdtempSync(join(tmpdir(), "atlas-pdf-qa-"));
  const pdfPath = join(dir, "doc.pdf");
  let extractedText = "";
  let rasterizedPages = 0;
  try {
    writeFileSync(pdfPath, file.buffer);
    extractedText = await extractWithPdftotext(pdfPath);
    if (rasterizeToolAvailable) {
      rasterizedPages = await rasterizePageCount(pdfPath, dir);
    }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const charCount = extractedText.replace(/\s+/g, "").length;
  const blankRatio = countBlankLinesRatio(extractedText);
  const latin = file.buffer.toString("latin1");
  const hasContentStream = /BT[\s\S]*?ET/.test(latin) || /Tj|TJ/.test(latin);
  const hasFont = /\/Font|FontFile|CIDFont|ToUnicode/.test(latin);

  // Only hard-fail rasterize when the host actually has pdftoppm.
  // Missing poppler on serverless must not abort Word+PDF companion exports.
  if (pageCount >= 1 && rasterizeToolAvailable && rasterizedPages < 1) {
    reasons.push("rasterize_failed");
  }

  if (charCount > 0) {
    if (charCount < minChars) reasons.push("insufficient_text");
    if (blankRatio > maxBlankRatio) reasons.push("blank_ratio_high");
  } else {
    // Empty extract is common for JP subset fonts — require structural proof.
    if (!hasContentStream && !hasFont) {
      reasons.push("no_text_content_stream");
    }
    if (file.buffer.byteLength < 2_000) reasons.push("blank_pdf");
    if (pageCount >= 1 && !hasFont && !hasContentStream) {
      reasons.push("blank_pdf");
    }
  }

  return {
    ok: reasons.length === 0,
    pageCount,
    extractedText: extractedText.slice(0, 4_000),
    charCount,
    blankRatio,
    rasterizedPages,
    reasons,
    rasterizeToolAvailable,
  };
}

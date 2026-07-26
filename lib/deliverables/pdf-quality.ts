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

/**
 * Post-generation PDF QA:
 * page count · text extract · blank ratio · char count · rasterize sample pages.
 *
 * Note: Japanese CID/subset fonts often yield empty pdftotext. In that case we
 * still require pages + rasterize + embedded font/content evidence (not blank).
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
  const latin = file.buffer.toString("latin1");
  const hasContentStream = /BT[\s\S]*?ET/.test(latin) || /Tj|TJ/.test(latin);
  const hasFont = /\/Font|FontFile|CIDFont|ToUnicode/.test(latin);

  if (pageCount >= 1 && rasterizedPages < 1) reasons.push("rasterize_failed");
  if (!hasContentStream && !hasFont) reasons.push("no_text_content_stream");

  if (charCount > 0) {
    if (charCount < minChars) reasons.push("insufficient_text");
    if (blankRatio > maxBlankRatio) reasons.push("blank_ratio_high");
  } else {
    // Empty extract is common for JP subset fonts — require structural proof.
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
  };
}

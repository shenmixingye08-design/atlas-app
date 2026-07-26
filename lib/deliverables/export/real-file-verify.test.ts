import { execFileSync, execSync } from "child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"

import { describe, expect, it } from "vitest"
import JSZip from "jszip"

import {
  normalizeToStructuredDocument,
  renderCanonicalHtml,
  structuredDocumentToMarkdown,
} from "@/lib/deliverables/document"
import { exportWithFallback } from "@/lib/deliverables/export/fallback"
import {
  REAL_FILE_SOURCE,
  REAL_FILE_TITLE,
} from "@/lib/deliverables/export/real-file-fixture"
import {
  compactLength,
  contentMatchRate,
  normalizeDeliverableText,
  orderedCharRecall,
} from "@/lib/deliverables/export/text-similarity"

const OUT = join(process.cwd(), "artifacts/deliverable-export-verify")
const ARTIFACTS = "/opt/cursor/artifacts/deliverable-export-verify"

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file("word/document.xml")?.async("string")
  if (!xml) return ""
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim()
}

function hasCmd(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim()
}

describe("real Word/PDF/Web file verification (completion gates)", () => {
  it("meets 1000-char Japanese + 95% extract/match + visual gates", async () => {
    mkdirSync(OUT, { recursive: true })
    mkdirSync(ARTIFACTS, { recursive: true })

    // 1) Source must be 1000+ compact characters
    const sourceCompact = compactLength(REAL_FILE_SOURCE)
    expect(sourceCompact).toBeGreaterThanOrEqual(1000)

    const normalized = normalizeToStructuredDocument(REAL_FILE_SOURCE, {
      titleHint: REAL_FILE_TITLE,
    })
    const markdown = structuredDocumentToMarkdown(normalized.document)
    const html = renderCanonicalHtml(normalized.document)
    const webText = stripHtml(html.html)

    writeFileSync(join(OUT, "web-canonical.html"), html.html, "utf8")
    writeFileSync(join(OUT, "web-markdown.md"), markdown, "utf8")
    writeFileSync(join(OUT, "web-extracted.txt"), webText, "utf8")
    writeFileSync(
      join(OUT, "structured.json"),
      JSON.stringify(normalized.document, null, 2),
    )

    // 2) Word generate
    const word = await exportWithFallback({
      source: REAL_FILE_SOURCE,
      format: "docx",
      titleHint: REAL_FILE_TITLE,
    })
    expect(word.ok).toBe(true)
    expect(word.buffer).toBeTruthy()
    writeFileSync(join(OUT, "single-selection.docx"), word.buffer!)
    writeFileSync(join(ARTIFACTS, "single-selection.docx"), word.buffer!)

    // 3) Re-open Word (unzip document.xml) and verify content
    const docxText = await extractDocxText(word.buffer!)
    writeFileSync(join(OUT, "word-extracted.txt"), docxText, "utf8")
    writeFileSync(join(ARTIFACTS, "word-extracted.txt"), docxText, "utf8")
    expect(compactLength(docxText)).toBeGreaterThanOrEqual(1000)
    expect(docxText).toContain(REAL_FILE_TITLE)
    expect(docxText).not.toContain("\\n")
    expect(docxText).not.toContain("[object Object]")
    expect(docxText).not.toMatch(/"type"\s*:/)
    expect(docxText).not.toMatch(/\bundefined\b/)
    expect(word.buffer!.byteLength).toBeGreaterThan(5_000)

    // 4) PDF generate
    const pdf = await exportWithFallback({
      source: REAL_FILE_SOURCE,
      format: "pdf",
      titleHint: REAL_FILE_TITLE,
    })
    expect(pdf.ok).toBe(true)
    expect(pdf.buffer).toBeTruthy()
    writeFileSync(join(OUT, "single-selection.pdf"), pdf.buffer!)
    writeFileSync(join(ARTIFACTS, "single-selection.pdf"), pdf.buffer!)
    expect(pdf.buffer!.subarray(0, 4).toString("latin1")).toBe("%PDF")
    expect(pdf.buffer!.byteLength).toBeGreaterThan(50_000)

    if (!hasCmd("pdftotext") || !hasCmd("pdftoppm")) {
      throw new Error(
        "pdftotext/pdftoppm required for real PDF visual verification",
      )
    }

    // 5) PDF → images
    execFileSync("pdftoppm", [
      "-png",
      "-r",
      "150",
      join(OUT, "single-selection.pdf"),
      join(OUT, "pdf-page"),
    ])
    execFileSync("pdftoppm", [
      "-png",
      "-r",
      "150",
      join(OUT, "single-selection.pdf"),
      join(ARTIFACTS, "pdf-page"),
    ])
    const page1 = join(OUT, "pdf-page-1.png")
    expect(existsSync(page1)).toBe(true)
    const pageBytes = readFileSync(page1).byteLength
    expect(pageBytes).toBeGreaterThan(30_000)

    // 7) PDF text extract ≥ 95% of source body
    const pdfText = execFileSync(
      "pdftotext",
      ["-layout", join(OUT, "single-selection.pdf"), "-"],
      { encoding: "utf8" },
    )
    writeFileSync(join(OUT, "pdf-extracted.txt"), pdfText, "utf8")
    writeFileSync(join(ARTIFACTS, "pdf-extracted.txt"), pdfText, "utf8")
    expect(compactLength(pdfText)).toBeGreaterThanOrEqual(1000)
    expect(pdfText).not.toContain("\\n")
    expect(pdfText).not.toMatch(/"type"\s*:/)

    const pdfRecall = orderedCharRecall(REAL_FILE_SOURCE, pdfText)
    const wordRecall = orderedCharRecall(REAL_FILE_SOURCE, docxText)
    const webRecall = orderedCharRecall(REAL_FILE_SOURCE, webText)
    const wordPdfMatch = contentMatchRate(docxText, pdfText)
    const wordWebMatch = contentMatchRate(docxText, webText)
    const pdfWebMatch = contentMatchRate(pdfText, webText)
    const tripleMatch = Math.min(wordPdfMatch, wordWebMatch, pdfWebMatch)

    // 8) Word / PDF / Web match ≥ 95%
    expect(pdfRecall).toBeGreaterThanOrEqual(0.95)
    expect(wordRecall).toBeGreaterThanOrEqual(0.95)
    expect(webRecall).toBeGreaterThanOrEqual(0.95)
    expect(tripleMatch).toBeGreaterThanOrEqual(0.95)

    const pageCount =
      pdf.pdfMeta?.pageCount ??
      Number(
        execFileSync("pdfinfo", [join(OUT, "single-selection.pdf")], {
          encoding: "utf8",
        }).match(/Pages:\s+(\d+)/)?.[1] ?? "0",
      )

    const report = {
      title: REAL_FILE_TITLE,
      sourceCompactChars: sourceCompact,
      sourceNormalizedChars: normalizeDeliverableText(REAL_FILE_SOURCE).length,
      docxPath: join(OUT, "single-selection.docx"),
      pdfPath: join(OUT, "single-selection.pdf"),
      artifactDocx: join(ARTIFACTS, "single-selection.docx"),
      artifactPdf: join(ARTIFACTS, "single-selection.pdf"),
      artifactPage1: join(ARTIFACTS, "pdf-page-1.png"),
      wordExtractedChars: compactLength(docxText),
      pdfExtractedChars: compactLength(pdfText),
      webExtractedChars: compactLength(webText),
      pdfPageCount: pageCount,
      pdfPagePngBytes: pageBytes,
      wordBytes: word.buffer!.byteLength,
      pdfBytes: pdf.buffer!.byteLength,
      pdfExtractionRecall: Number(pdfRecall.toFixed(4)),
      wordExtractionRecall: Number(wordRecall.toFixed(4)),
      webExtractionRecall: Number(webRecall.toFixed(4)),
      wordPdfMatch: Number(wordPdfMatch.toFixed(4)),
      wordWebMatch: Number(wordWebMatch.toFixed(4)),
      pdfWebMatch: Number(pdfWebMatch.toFixed(4)),
      tripleMatchRate: Number(tripleMatch.toFixed(4)),
      noRawJson: true,
      renderer: "pdf-lib + DroidSansFallbackFull (CJK) + Helvetica (Latin)",
      wordLibrary: "docx",
      pdfInspector: "poppler pdftotext/pdftoppm",
      gates: {
        source1000: sourceCompact >= 1000,
        pdfExtract95: pdfRecall >= 0.95,
        tripleMatch95: tripleMatch >= 0.95,
      },
    }
    writeFileSync(join(OUT, "verification-report.json"), JSON.stringify(report, null, 2))
    writeFileSync(
      join(ARTIFACTS, "verification-report.json"),
      JSON.stringify(report, null, 2),
    )
    writeFileSync(
      join(ARTIFACTS, "web-extracted.txt"),
      webText,
      "utf8",
    )
    writeFileSync(join(ARTIFACTS, "web-canonical.html"), html.html, "utf8")
  }, 180_000)
})

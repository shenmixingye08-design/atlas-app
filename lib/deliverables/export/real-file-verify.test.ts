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

function compactLen(text: string): number {
  return text.replace(/\s+/g, "").length
}

describe("real Word/PDF/Web file verification", () => {
  it("generates readable Japanese Word/PDF matching Web source", async () => {
    mkdirSync(OUT, { recursive: true })
    mkdirSync(ARTIFACTS, { recursive: true })

    const normalized = normalizeToStructuredDocument(REAL_FILE_SOURCE, {
      titleHint: REAL_FILE_TITLE,
    })
    const markdown = structuredDocumentToMarkdown(normalized.document)
    const html = renderCanonicalHtml(normalized.document)

    writeFileSync(join(OUT, "web-canonical.html"), html.html, "utf8")
    writeFileSync(join(OUT, "web-markdown.md"), markdown, "utf8")
    writeFileSync(
      join(OUT, "structured.json"),
      JSON.stringify(normalized.document, null, 2),
    )

    const word = await exportWithFallback({
      source: REAL_FILE_SOURCE,
      format: "docx",
      titleHint: REAL_FILE_TITLE,
    })
    expect(word.ok).toBe(true)
    expect(word.buffer).toBeTruthy()
    writeFileSync(join(OUT, "single-selection.docx"), word.buffer!)
    writeFileSync(join(ARTIFACTS, "single-selection.docx"), word.buffer!)

    const pdf = await exportWithFallback({
      source: REAL_FILE_SOURCE,
      format: "pdf",
      titleHint: REAL_FILE_TITLE,
    })
    expect(pdf.ok).toBe(true)
    expect(pdf.buffer).toBeTruthy()
    writeFileSync(join(OUT, "single-selection.pdf"), pdf.buffer!)
    writeFileSync(join(ARTIFACTS, "single-selection.pdf"), pdf.buffer!)

    const docxText = await extractDocxText(word.buffer!)
    writeFileSync(join(OUT, "word-extracted.txt"), docxText, "utf8")
    writeFileSync(join(ARTIFACTS, "word-extracted.txt"), docxText, "utf8")

    expect(compactLen(docxText)).toBeGreaterThanOrEqual(500)
    expect(docxText).toContain(REAL_FILE_TITLE)
    expect(docxText).toContain("はじめに")
    expect(docxText).toContain("選出の観点")
    expect(docxText).toContain("おすすめ選出セット")
    expect(docxText).toContain("まとめ")
    expect(docxText).toContain("住居：")
    expect(docxText).toContain("立地利便性")
    expect(docxText).toContain("プランA")
    expect(docxText).toContain("91")
    expect(docxText).not.toMatch(/"type"\s*:/)
    expect(docxText).not.toMatch(/"content"\s*:/)
    expect(docxText).not.toContain("```json")
    expect(docxText).not.toContain("\\n")
    expect(docxText).not.toContain("[object Object]")
    expect(docxText).not.toMatch(/\bundefined\b/)
    expect(word.buffer!.byteLength).toBeGreaterThan(5_000)

    // PDF binary + text extraction (poppler)
    expect(pdf.buffer!.subarray(0, 4).toString("latin1")).toBe("%PDF")
    expect(pdf.buffer!.byteLength).toBeGreaterThan(8_000)

    if (!hasCmd("pdftotext") || !hasCmd("pdftoppm")) {
      throw new Error(
        "pdftotext/pdftoppm required for real PDF visual verification",
      )
    }

    const pdfText = execFileSync(
      "pdftotext",
      ["-layout", join(OUT, "single-selection.pdf"), "-"],
      { encoding: "utf8" },
    )
    writeFileSync(join(OUT, "pdf-extracted.txt"), pdfText, "utf8")
    writeFileSync(join(ARTIFACTS, "pdf-extracted.txt"), pdfText, "utf8")

    expect(compactLen(pdfText)).toBeGreaterThanOrEqual(500)
    expect(pdfText).toContain(REAL_FILE_TITLE)
    expect(pdfText).toContain("はじめに")
    expect(pdfText).toContain("選出の観点")
    expect(pdfText).toContain("おすすめ選出セット")
    expect(pdfText).toContain("まとめ")
    expect(pdfText).toContain("住居：")
    expect(pdfText).toContain("立地利便性")
    expect(pdfText).toContain("プランA")
    expect(pdfText).toContain("91")
    expect(pdfText).not.toMatch(/"type"\s*:/)
    expect(pdfText).not.toContain("\\n")
    expect(pdfText).not.toContain("[object Object]")

    execFileSync("pdftoppm", [
      "-png",
      "-r",
      "140",
      join(OUT, "single-selection.pdf"),
      join(OUT, "pdf-page"),
    ])
    execFileSync("pdftoppm", [
      "-png",
      "-r",
      "140",
      join(OUT, "single-selection.pdf"),
      join(ARTIFACTS, "pdf-page"),
    ])

    const page1 = join(OUT, "pdf-page-1.png")
    expect(existsSync(page1)).toBe(true)
    // Non-blank page: rendered PNG must be larger than a nearly-empty white page.
    const pageBytes = readFileSync(page1).byteLength
    expect(pageBytes).toBeGreaterThan(20_000)

    // Consistency across Web / Word / PDF
    expect(normalized.document.title).toBe(REAL_FILE_TITLE)
    expect(markdown).toContain(REAL_FILE_TITLE)
    expect(docxText.includes(REAL_FILE_TITLE) && pdfText.includes(REAL_FILE_TITLE)).toBe(
      true,
    )
    for (const key of ["はじめに", "立地利便性", "住居：", "91", "MINERVOT"] as const) {
      expect(markdown).toContain(key.replace("：", ""))
      expect(docxText.includes(key) || docxText.includes(key.replace("：", ":"))).toBe(
        true,
      )
      expect(pdfText.includes(key) || pdfText.includes(key.replace("：", ":"))).toBe(
        true,
      )
    }

    const report = {
      docxPath: join(OUT, "single-selection.docx"),
      pdfPath: join(OUT, "single-selection.pdf"),
      artifactDocx: join(ARTIFACTS, "single-selection.docx"),
      artifactPdf: join(ARTIFACTS, "single-selection.pdf"),
      wordExtractedChars: compactLen(docxText),
      pdfExtractedChars: compactLen(pdfText),
      pdfPageCount: pdf.pdfMeta?.pageCount ?? null,
      pdfPagePngBytes: pageBytes,
      wordBytes: word.buffer!.byteLength,
      pdfBytes: pdf.buffer!.byteLength,
      renderer: "pdf-lib + DroidSansFallbackFull (CJK) + Helvetica (Latin)",
      wordLibrary: "docx",
      noRawJson: true,
    }
    writeFileSync(join(OUT, "verification-report.json"), JSON.stringify(report, null, 2))
    writeFileSync(
      join(ARTIFACTS, "verification-report.json"),
      JSON.stringify(report, null, 2),
    )
  }, 180_000)
})

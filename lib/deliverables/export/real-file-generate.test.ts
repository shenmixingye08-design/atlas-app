import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"

import { describe, expect, it } from "vitest"

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

describe("real file generation artifacts", () => {
  it("writes Word/PDF/Web artifacts for manual+automated inspection", async () => {
    const outDir = join(process.cwd(), "artifacts/deliverable-export-verify")
    mkdirSync(outDir, { recursive: true })

    const normalized = normalizeToStructuredDocument(REAL_FILE_SOURCE, {
      titleHint: REAL_FILE_TITLE,
    })
    expect(normalized.plainText.replace(/\s+/g, "").length).toBeGreaterThan(500)

    const markdown = structuredDocumentToMarkdown(normalized.document)
    const html = renderCanonicalHtml(normalized.document)
    writeFileSync(join(outDir, "web-canonical.html"), html.html, "utf8")
    writeFileSync(join(outDir, "web-markdown.md"), markdown, "utf8")
    writeFileSync(
      join(outDir, "structured.json"),
      JSON.stringify(normalized.document, null, 2),
      "utf8",
    )

    const word = await exportWithFallback({
      source: REAL_FILE_SOURCE,
      format: "docx",
      titleHint: REAL_FILE_TITLE,
    })
    expect(word.ok).toBe(true)
    writeFileSync(join(outDir, "single-selection.docx"), word.buffer!)

    const pdf = await exportWithFallback({
      source: REAL_FILE_SOURCE,
      format: "pdf",
      titleHint: REAL_FILE_TITLE,
    })
    expect(pdf.ok).toBe(true)
    writeFileSync(join(outDir, "single-selection.pdf"), pdf.buffer!)

    writeFileSync(
      join(outDir, "meta.json"),
      JSON.stringify(
        {
          wordOk: word.ok,
          pdfOk: pdf.ok,
          wordTextLength: word.wordMeta?.textLength,
          pdfExtracted: pdf.pdfMeta?.extractedTextLength,
          pdfPages: pdf.pdfMeta?.pageCount,
          title: normalized.document.title,
          plainTextLength: normalized.plainText.length,
        },
        null,
        2,
      ),
    )
  }, 120_000)
})

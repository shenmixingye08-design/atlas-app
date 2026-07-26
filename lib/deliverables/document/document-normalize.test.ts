import { describe, expect, it } from "vitest"

import {
  extractVisibleTextFromHtml,
  normalizeToStructuredDocument,
  renderCanonicalHtml,
  structuredDocumentToMarkdown,
  validateCanonicalHtml,
} from "@/lib/deliverables/document"
import { exportWithFallback } from "@/lib/deliverables/export/fallback"
import { PRINT_STYLES } from "@/lib/deliverables/export/print-styles"
import { validatePdfExport } from "@/lib/deliverables/export/export-validator"

describe("document normalizer + export quality", () => {
  it("1. converts JSON string to Structured Document", () => {
    const input = JSON.stringify({
      title: "営業資料",
      content: "# 概要\n本文です。\n- 項目1",
    })
    const result = normalizeToStructuredDocument(input)
    expect(result.document.title).toBe("営業資料")
    expect(result.sourceFormat).toBe("json")
    expect(result.document.sections.some((s) => s.type === "heading")).toBe(true)
    expect(result.document.sections.some((s) => s.type === "bulletList")).toBe(
      true,
    )
    expect(JSON.stringify(result.document)).not.toContain('\\"type\\"')
  })

  it("2. converts escaped JSON", () => {
    const input = '{"title":"営業資料","content":"# 概要\\n本文\\n- 項目1"}'
    const result = normalizeToStructuredDocument(input)
    expect(result.document.title).toBe("営業資料")
    expect(result.plainText).toContain("本文")
    expect(result.plainText).not.toContain("\\n")
  })

  it("3. converts markdown", () => {
    const result = normalizeToStructuredDocument(
      "# 提案\n\n## 背景\n\n説明文\n\n- A\n- B",
    )
    expect(result.sourceFormat).toBe("markdown")
    expect(result.document.title).toBe("提案")
    expect(
      result.document.sections.some(
        (s) => s.type === "heading" && s.text === "背景",
      ),
    ).toBe(true)
  })

  it("4. converts plain text", () => {
    const result = normalizeToStructuredDocument("段落1です。\n\n段落2です。")
    expect(result.sourceFormat).toBe("plain")
    expect(
      result.document.sections.filter((s) => s.type === "paragraph").length,
    ).toBeGreaterThanOrEqual(1)
  })

  it("5. converts \\n to real newlines", () => {
    const result = normalizeToStructuredDocument("行1\\n行2\\n- 項目")
    expect(result.plainText).toContain("行1")
    expect(result.plainText).toContain("行2")
    expect(result.plainText.includes("\\n")).toBe(false)
  })

  it("6. web-facing markdown from structured doc has no raw JSON", () => {
    const input = JSON.stringify({
      type: "document",
      title: "資料",
      content: "本文のみ",
    })
    const md = structuredDocumentToMarkdown(
      normalizeToStructuredDocument(input).document,
    )
    expect(md).not.toContain('"type":')
    expect(md).not.toContain('"content":')
    expect(md).toContain("資料")
    expect(md).toContain("本文のみ")
  })

  it("7-8. Word has no JSON and no literal \\n", async () => {
    const source = JSON.stringify({
      title: "提案書",
      content: "# 概要\n詳細説明がここに入ります。\n- 要点1\n- 要点2",
    })
    const exported = await exportWithFallback({
      source,
      format: "docx",
      titleHint: "提案書",
    })
    expect(exported.ok).toBe(true)
    expect(exported.buffer).toBeTruthy()
    const text = exported.buffer!.toString("utf8")
    expect(text.includes("```json")).toBe(false)
    // Structured content should be present as document title path
    expect(exported.wordMeta!.textLength).toBeGreaterThan(10)
    expect(exported.markdown.includes("\\n")).toBe(false)
  })

  it("9-11. PDF renders body text, not blank, with Japanese", async () => {
    const source = [
      "# 営業提案書",
      "",
      "## 背景",
      "",
      "日本語の本文がここにあります。品質改善のための提案です。",
      "",
      "- 箇条書き一",
      "- 箇条書き二",
      "",
      "| 項目 | 内容 |",
      "| --- | --- |",
      "| A | 値1 |",
    ].join("\n")

    const exported = await exportWithFallback({
      source,
      format: "pdf",
      titleHint: "営業提案書",
    })
    expect(exported.ok).toBe(true)
    expect(exported.buffer!.subarray(0, 4).toString("latin1")).toBe("%PDF")
    expect(exported.pdfMeta!.extractedTextLength).toBeGreaterThan(20)
    expect(exported.pdfMeta!.pageCount).toBeGreaterThanOrEqual(1)
    expect(exported.document.title).toContain("営業")
  })

  it("12-14. headings, bullets, tables are in structured doc + html", () => {
    const result = normalizeToStructuredDocument(`# 題名

## 見出し二

段落

- 点1
- 点2

| H1 | H2 |
| --- | --- |
| a | b |
`)
    const types = new Set(result.document.sections.map((s) => s.type))
    expect(types.has("heading")).toBe(true)
    expect(types.has("bulletList")).toBe(true)
    expect(types.has("table")).toBe(true)
    const html = renderCanonicalHtml(result.document)
    expect(html.html).toContain("<h2>")
    expect(html.html).toContain("<ul>")
    expect(html.html).toContain("<table>")
    expect(extractVisibleTextFromHtml(html.html)).toContain("点1")
  })

  it("15-16. canonical HTML excludes dark mode and UI buttons", () => {
    const doc = normalizeToStructuredDocument("# T\n\n本文").document
    const html = renderCanonicalHtml(doc)
    expect(PRINT_STYLES).not.toMatch(/prefers-color-scheme\s*:\s*dark/)
    expect(html.html).not.toContain("<button")
    expect(html.html).not.toContain("<nav")
    expect(html.html).toContain("background: #ffffff")
    const validation = validateCanonicalHtml(html.html, doc)
    expect(validation.ok).toBe(true)
  })

  it("17-18. PDF validation rejects tiny extracted text vs large source", () => {
    const doc = normalizeToStructuredDocument(
      `# 長い文書\n\n${"あいうえお。".repeat(120)}`,
    ).document
    const result = validatePdfExport({
      buffer: Buffer.from("%PDF-1.4 tiny"),
      pageCount: 1,
      extractedTextLength: 5,
      document: doc,
    })
    expect(result.ok).toBe(false)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it("19. legacy raw JSON artifacts normalize on read", () => {
    const legacy = "{\"title\":\"旧成果物\",\"content\":\"# 見出し\\n本文です\"}"
    const result = normalizeToStructuredDocument(legacy)
    expect(result.normalizedSuccessfully).toBe(true)
    expect(result.document.title).toBe("旧成果物")
    expect(result.plainText).toContain("本文")
  })

  it("20. Word/PDF/Web share the same structured body", async () => {
    const source = JSON.stringify({
      title: "共通本文",
      content: "## 節\n同じ本文を共有します。\n- 共有項目",
    })
    const normalized = normalizeToStructuredDocument(source)
    const md = structuredDocumentToMarkdown(normalized.document)
    const word = await exportWithFallback({ source: md, format: "docx" })
    const pdf = await exportWithFallback({ source: md, format: "pdf" })
    expect(word.document.title).toBe(pdf.document.title)
    expect(word.document.title).toBe(normalized.document.title)
    expect(word.markdown).toContain("同じ本文を共有します")
    expect(pdf.markdown).toContain("同じ本文を共有します")
    expect(word.ok && pdf.ok).toBe(true)
  })
})

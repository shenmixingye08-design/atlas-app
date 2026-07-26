import {
  normalizeToStructuredDocument,
  structuredDocumentToMarkdown,
} from "../document/normalize"
import { renderCanonicalHtml } from "../document/html-renderer"
import type { StructuredDocument } from "../document/types"
import { renderPdfFromDocument } from "./pdf-renderer"
import { renderWordFromDocument } from "./word-renderer"
import {
  extractDocxXmlText,
  validatePdfExport,
  validateWordExport,
} from "./export-validator"
import { recordExportTelemetry } from "./telemetry"
import { validateCanonicalHtml } from "../document/validator"

export type ExportFormat = "docx" | "pdf"

export type StructuredExportResult = {
  ok: boolean
  buffer: Buffer | null
  document: StructuredDocument
  canonicalHtml: string
  markdown: string
  retryCount: number
  failureReason: string | null
  wordMeta?: {
    fileSize: number
    textLength: number
    paragraphCount: number
  }
  pdfMeta?: {
    fileSize: number
    pageCount: number
    extractedTextLength: number
  }
}

async function attemptWord(doc: StructuredDocument) {
  const rendered = await renderWordFromDocument(doc)
  const xml = await extractDocxXmlText(rendered.buffer)
  const validation = validateWordExport({
    buffer: rendered.buffer,
    textLength: rendered.textLength,
    paragraphCount: rendered.paragraphCount,
    document: doc,
    documentXml: xml,
  })
  return { rendered, validation }
}

async function attemptPdf(doc: StructuredDocument) {
  const rendered = await renderPdfFromDocument(doc)
  const validation = validatePdfExport({
    buffer: rendered.buffer,
    pageCount: rendered.pageCount,
    extractedTextLength: rendered.renderedTextLength,
    document: doc,
  })
  return { rendered, validation }
}

/**
 * Export Word/PDF from a shared Structured Document.
 * On failure: regenerate structured doc + HTML once, then fail (no infinite retry).
 * Never returns a broken file as success.
 */
export async function exportWithFallback(input: {
  source: string
  format: ExportFormat
  titleHint?: string
  artifactType?: string
}): Promise<StructuredExportResult> {
  let retryCount = 0
  let normalizeResult = normalizeToStructuredDocument(input.source, {
    titleHint: input.titleHint,
    artifactType: input.artifactType,
  })
  let document = normalizeResult.document
  let html = renderCanonicalHtml(document)
  let htmlValidation = validateCanonicalHtml(html.html, document)

  const markdown = () => structuredDocumentToMarkdown(document)

  const fail = (reason: string): StructuredExportResult => {
    recordExportTelemetry({
      sourceFormat: normalizeResult.sourceFormat,
      normalizedSuccessfully: normalizeResult.normalizedSuccessfully,
      normalizationWarnings: normalizeResult.warnings.map((w) => w.code),
      canonicalHtmlLength: html.length,
      wordFileSize: null,
      wordTextLength: null,
      pdfFileSize: null,
      pdfPageCount: null,
      pdfExtractedTextLength: null,
      exportValidationResult: "fail",
      retryCount,
      failureReason: reason,
      format: input.format,
    })
    return {
      ok: false,
      buffer: null,
      document,
      canonicalHtml: html.html,
      markdown: markdown(),
      retryCount,
      failureReason: reason,
    }
  }

  if (!normalizeResult.normalizedSuccessfully || !htmlValidation.ok) {
    // One recovery pass
    retryCount = 1
    normalizeResult = normalizeToStructuredDocument(input.source, {
      titleHint: input.titleHint || document.title,
      artifactType: input.artifactType,
    })
    document = normalizeResult.document
    html = renderCanonicalHtml(document)
    htmlValidation = validateCanonicalHtml(html.html, document)
    if (!normalizeResult.normalizedSuccessfully || !htmlValidation.ok) {
      return fail(
        `normalize_or_html_failed:${htmlValidation.reasons.join(",") || "empty"}`,
      )
    }
  }

  if (input.format === "docx") {
    let attempt = await attemptWord(document)
    if (!attempt.validation.ok && retryCount === 0) {
      retryCount = 1
      normalizeResult = normalizeToStructuredDocument(input.source, {
        titleHint: document.title,
        artifactType: input.artifactType,
      })
      document = normalizeResult.document
      html = renderCanonicalHtml(document)
      attempt = await attemptWord(document)
    }
    if (!attempt.validation.ok) {
      return fail(`word_validation:${attempt.validation.reasons.join(",")}`)
    }
    recordExportTelemetry({
      sourceFormat: normalizeResult.sourceFormat,
      normalizedSuccessfully: true,
      normalizationWarnings: normalizeResult.warnings.map((w) => w.code),
      canonicalHtmlLength: html.length,
      wordFileSize: attempt.rendered.buffer.byteLength,
      wordTextLength: attempt.rendered.textLength,
      pdfFileSize: null,
      pdfPageCount: null,
      pdfExtractedTextLength: null,
      exportValidationResult: "pass",
      retryCount,
      failureReason: null,
      format: "docx",
    })
    return {
      ok: true,
      buffer: attempt.rendered.buffer,
      document,
      canonicalHtml: html.html,
      markdown: markdown(),
      retryCount,
      failureReason: null,
      wordMeta: {
        fileSize: attempt.rendered.buffer.byteLength,
        textLength: attempt.rendered.textLength,
        paragraphCount: attempt.rendered.paragraphCount,
      },
    }
  }

  let attempt = await attemptPdf(document)
  if (!attempt.validation.ok && retryCount === 0) {
    retryCount = 1
    normalizeResult = normalizeToStructuredDocument(input.source, {
      titleHint: document.title,
      artifactType: input.artifactType,
    })
    document = normalizeResult.document
    html = renderCanonicalHtml(document)
    attempt = await attemptPdf(document)
  }
  if (!attempt.validation.ok) {
    return fail(`pdf_validation:${attempt.validation.reasons.join(",")}`)
  }
  recordExportTelemetry({
    sourceFormat: normalizeResult.sourceFormat,
    normalizedSuccessfully: true,
    normalizationWarnings: normalizeResult.warnings.map((w) => w.code),
    canonicalHtmlLength: html.length,
    wordFileSize: null,
    wordTextLength: null,
    pdfFileSize: attempt.rendered.buffer.byteLength,
    pdfPageCount: attempt.rendered.pageCount,
    pdfExtractedTextLength: attempt.rendered.renderedTextLength,
    exportValidationResult: "pass",
    retryCount,
    failureReason: null,
    format: "pdf",
  })
  return {
    ok: true,
    buffer: attempt.rendered.buffer,
    document,
    canonicalHtml: html.html,
    markdown: markdown(),
    retryCount,
    failureReason: null,
    pdfMeta: {
      fileSize: attempt.rendered.buffer.byteLength,
      pageCount: attempt.rendered.pageCount,
      extractedTextLength: attempt.rendered.renderedTextLength,
    },
  }
}

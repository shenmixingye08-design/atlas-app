import type { StructuredDocument } from "../document/types"
import { documentPlainTextLength } from "../document/validator"

const FORBIDDEN_WORD_MARKERS = [
  '"type":',
  '"content":',
  "\\n",
  "```json",
  "undefined",
  "[object Object]",
]

export type WordValidationResult = {
  ok: boolean
  reasons: string[]
  fileSize: number
  textLength: number
  paragraphCount: number
  hasTitle: boolean
}

export type PdfValidationResult = {
  ok: boolean
  reasons: string[]
  fileSize: number
  pageCount: number
  extractedTextLength: number
  sourceTextLength: number
  blankPageRisk: boolean
  hasTitle: boolean
}

export function validateWordExport(input: {
  buffer: Buffer
  textLength: number
  paragraphCount: number
  document: StructuredDocument
  /** Unzipped document.xml text when available */
  documentXml?: string
}): WordValidationResult {
  const reasons: string[] = []
  const fileSize = input.buffer.byteLength
  const hasTitle = input.document.title.trim().length > 0
  const sourceLen = documentPlainTextLength(input.document)

  if (fileSize < 1_500) reasons.push("file_too_small")
  if (!hasTitle) reasons.push("missing_title")
  if (input.textLength < 10) reasons.push("text_too_short")
  if (input.paragraphCount < 1) reasons.push("no_paragraphs")
  if (sourceLen > 80 && input.textLength < Math.min(20, sourceLen * 0.05)) {
    reasons.push("text_loss")
  }

  const haystack = input.documentXml ?? ""
  for (const marker of FORBIDDEN_WORD_MARKERS) {
    if (haystack.includes(marker)) {
      reasons.push(`forbidden:${marker}`)
    }
  }
  // Also scan UTF-8 buffer lightly for obvious JSON leakage
  const asText = input.buffer.toString("utf8")
  if (asText.includes('"type":') && asText.includes('"content":')) {
    reasons.push("forbidden_json_in_buffer")
  }
  if (asText.includes("```json")) reasons.push("forbidden_fence")

  return {
    ok: reasons.length === 0,
    reasons,
    fileSize,
    textLength: input.textLength,
    paragraphCount: input.paragraphCount,
    hasTitle,
  }
}

export function validatePdfExport(input: {
  buffer: Buffer
  pageCount: number
  extractedTextLength: number
  document: StructuredDocument
}): PdfValidationResult {
  const reasons: string[] = []
  const fileSize = input.buffer.byteLength
  const sourceTextLength = documentPlainTextLength(input.document)
  const hasTitle = input.document.title.trim().length > 0
  const blankPageRisk =
    input.pageCount > 0 &&
    input.extractedTextLength / Math.max(input.pageCount, 1) < 5

  if (fileSize < 800) reasons.push("file_too_small")
  if (input.pageCount < 1) reasons.push("no_pages")
  if (!hasTitle) reasons.push("missing_title")
  if (input.extractedTextLength < 10) reasons.push("extracted_text_too_short")
  if (blankPageRisk) reasons.push("blank_page_risk")
  if (
    sourceTextLength >= 500 &&
    input.extractedTextLength < 20
  ) {
    reasons.push("extracted_text_mismatch")
  }
  if (
    sourceTextLength >= 80 &&
    input.extractedTextLength < Math.max(20, Math.floor(sourceTextLength * 0.04))
  ) {
    reasons.push("severe_text_loss")
  }

  const head = input.buffer.subarray(0, 5).toString("latin1")
  if (!head.startsWith("%PDF")) reasons.push("invalid_pdf_header")

  return {
    ok: reasons.length === 0,
    reasons,
    fileSize,
    pageCount: input.pageCount,
    extractedTextLength: input.extractedTextLength,
    sourceTextLength,
    blankPageRisk,
    hasTitle,
  }
}

/** Inspect docx XML from buffer for forbidden markers (best-effort). */
export async function extractDocxXmlText(buffer: Buffer): Promise<string> {
  try {
    // docx is a zip — look for document.xml UTF-8 fragments without full unzip dep.
    const asLatin = buffer.toString("latin1")
    const marker = "word/document.xml"
    const idx = asLatin.indexOf(marker)
    if (idx < 0) return ""
    // Nearby compressed stream may not be readable; also scan whole buffer utf8 lossy.
    return buffer.toString("utf8")
  } catch {
    return ""
  }
}

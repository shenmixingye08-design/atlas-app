import type { NormalizeWarning, SourceFormat } from "./types"
import {
  sanitizeText,
  stripCodeFences,
  stripWrappingQuotes,
  unescapeLiteralEscapes,
} from "./sanitize"

export type ParsedJsonPayload = {
  title?: string
  summary?: string
  content?: string
  markdown?: string
  body?: string
  plainText?: string
  type?: string
  sections?: unknown
  raw: Record<string, unknown>
  sourceFormat: SourceFormat
  warnings: NormalizeWarning[]
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Attempt to decode JSON / escaped JSON / double-encoded JSON into a payload.
 * Throws are converted to warnings — callers must fall back to markdown/plain.
 */
export function parseJsonDeliverable(
  input: string,
): ParsedJsonPayload | null {
  const warnings: NormalizeWarning[] = []
  let text = stripCodeFences(input.trim())
  text = stripWrappingQuotes(text)

  let parsed = tryParseJson(text)
  let sourceFormat: SourceFormat = "json"

  if (parsed == null) {
    const unescaped = unescapeLiteralEscapes(text)
    parsed = tryParseJson(unescaped)
    if (parsed != null) {
      sourceFormat = "escaped_json"
      warnings.push({
        code: "escaped_json_decoded",
        message: "Escaped JSON was decoded before parse",
      })
      text = unescaped
    }
  }

  // Double-encoded: JSON.parse yields a string that is itself JSON.
  if (typeof parsed === "string") {
    const inner = tryParseJson(parsed) ?? tryParseJson(unescapeLiteralEscapes(parsed))
    if (inner && typeof inner === "object") {
      parsed = inner
      sourceFormat = "escaped_json"
      warnings.push({
        code: "double_encoded_json",
        message: "Double-encoded JSON string was decoded",
      })
    } else {
      return null
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null
  }

  const raw = parsed as Record<string, unknown>
  const asString = (v: unknown) =>
    typeof v === "string" ? sanitizeText(v) : undefined

  const content =
    asString(raw.content) ||
    asString(raw.body) ||
    asString(raw.markdown) ||
    asString(raw.plainText) ||
    asString(raw.text)

  // Nested content still JSON?
  let nestedContent = content
  if (content) {
    const nested = tryParseJson(content)
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const nestedRecord = nested as Record<string, unknown>
      nestedContent =
        asString(nestedRecord.content) ||
        asString(nestedRecord.body) ||
        asString(nestedRecord.markdown) ||
        content
      warnings.push({
        code: "nested_json_content",
        message: "content field contained nested JSON",
      })
    }
  }

  if (
    !asString(raw.title) &&
    !nestedContent &&
    !asString(raw.summary) &&
    !Array.isArray(raw.sections)
  ) {
    warnings.push({
      code: "json_without_document_fields",
      message: "JSON object lacked title/content/sections",
    })
    return null
  }

  return {
    title: asString(raw.title),
    summary: asString(raw.summary),
    content: nestedContent,
    markdown: asString(raw.markdown),
    body: asString(raw.body),
    plainText: asString(raw.plainText),
    type: asString(raw.type),
    sections: raw.sections,
    raw,
    sourceFormat,
    warnings,
  }
}

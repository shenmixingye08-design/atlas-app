import { parseJsonDeliverable } from "./parse-json"
import {
  parseMarkdownToSections,
  plainTextToSections,
} from "./parse-markdown"
import { sanitizeText } from "./sanitize"
import type {
  DocumentSection,
  NormalizeResult,
  NormalizeWarning,
  SourceFormat,
  StructuredDocument,
} from "./types"
import { STRUCTURED_DOCUMENT_VERSION } from "./types"

function looksLikeMarkdown(text: string): boolean {
  return /^(#{1,3}\s|[-*•]\s|\d+[.)]\s|>\s|\|.+\|)/m.test(text)
}

function sectionsToPlainText(doc: StructuredDocument): string {
  const parts: string[] = []
  if (doc.title) parts.push(doc.title)
  if (doc.summary) parts.push(doc.summary)
  for (const section of doc.sections) {
    switch (section.type) {
      case "heading":
      case "paragraph":
      case "quote":
        parts.push(section.text)
        break
      case "bulletList":
      case "numberedList":
        parts.push(...section.items)
        break
      case "table":
        parts.push(section.headers.join(" "), ...section.rows.map((r) => r.join(" ")))
        break
      default:
        break
    }
  }
  return parts.join("\n").trim()
}

function buildDocument(input: {
  title: string
  summary?: string
  sections: DocumentSection[]
  artifactType: string
  sourceFormat: SourceFormat
  id?: string
}): StructuredDocument {
  return {
    id: input.id ?? crypto.randomUUID(),
    title: input.title || "成果物",
    summary: input.summary,
    sections: input.sections,
    metadata: {
      artifactType: input.artifactType || "document",
      language: "ja",
      createdAt: new Date().toISOString(),
      version: STRUCTURED_DOCUMENT_VERSION,
      sourceFormat: input.sourceFormat,
    },
  }
}

function hydrateSectionsFromJsonSections(
  value: unknown,
  warnings: NormalizeWarning[],
): DocumentSection[] | null {
  if (!Array.isArray(value)) return null
  const sections: DocumentSection[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const type = typeof row.type === "string" ? row.type : ""
    if (type === "heading" && typeof row.text === "string") {
      const level = ([1, 2, 3] as const).includes(row.level as 1 | 2 | 3)
        ? (row.level as 1 | 2 | 3)
        : 2
      sections.push({ type: "heading", level, text: sanitizeText(row.text) })
    } else if (type === "paragraph" && typeof row.text === "string") {
      sections.push({ type: "paragraph", text: sanitizeText(row.text) })
    } else if (
      (type === "bulletList" || type === "numberedList") &&
      Array.isArray(row.items)
    ) {
      const items = row.items
        .filter((x): x is string => typeof x === "string")
        .map(sanitizeText)
        .filter(Boolean)
      sections.push(
        type === "bulletList"
          ? { type: "bulletList", items }
          : { type: "numberedList", items },
      )
    } else if (type === "table") {
      const headers = Array.isArray(row.headers)
        ? row.headers.filter((x): x is string => typeof x === "string")
        : []
      const rows = Array.isArray(row.rows)
        ? row.rows
            .filter((r): r is unknown[] => Array.isArray(r))
            .map((r) =>
              r.filter((c): c is string => typeof c === "string").map(sanitizeText),
            )
        : []
      sections.push({ type: "table", headers, rows })
    } else if (type === "quote" && typeof row.text === "string") {
      sections.push({ type: "quote", text: sanitizeText(row.text) })
    } else if (type === "pageBreak") {
      sections.push({ type: "pageBreak" })
    }
  }
  if (sections.length === 0) {
    warnings.push({
      code: "empty_json_sections",
      message: "JSON sections array produced no usable blocks",
    })
    return null
  }
  return sections
}

export type NormalizeOptions = {
  artifactType?: string
  titleHint?: string
  id?: string
}

/**
 * Normalize AI / stored deliverable text into a Structured Document.
 * Never leaves raw JSON or literal \\n as the document body.
 */
export function normalizeToStructuredDocument(
  input: string | Record<string, unknown>,
  options: NormalizeOptions = {},
): NormalizeResult {
  const warnings: NormalizeWarning[] = []
  const artifactType = options.artifactType ?? "document"

  if (input && typeof input === "object" && !Array.isArray(input)) {
    const asText = JSON.stringify(input)
    return normalizeToStructuredDocument(asText, options)
  }

  const raw = typeof input === "string" ? input : ""
  if (!raw.trim()) {
    const document = buildDocument({
      title: options.titleHint || "成果物",
      sections: [],
      artifactType,
      sourceFormat: "unknown",
      id: options.id,
    })
    return {
      document,
      sourceFormat: "unknown",
      warnings: [{ code: "empty_input", message: "Input was empty" }],
      normalizedSuccessfully: false,
      plainText: "",
    }
  }

  // 1) JSON path
  const jsonPayload = parseJsonDeliverable(raw)
  if (jsonPayload) {
    warnings.push(...jsonPayload.warnings)
    const fromSections = hydrateSectionsFromJsonSections(
      jsonPayload.sections,
      warnings,
    )
    const bodyText =
      jsonPayload.content ||
      jsonPayload.markdown ||
      jsonPayload.body ||
      jsonPayload.plainText ||
      ""

    let sections = fromSections
    if (!sections && bodyText) {
      const md = parseMarkdownToSections(bodyText)
      sections = md.sections
      if (!jsonPayload.title && md.title) {
        jsonPayload.title = md.title
      }
    }
    if (!sections || sections.length === 0) {
      sections = plainTextToSections(bodyText || raw)
    }

    // Avoid duplicating title as first heading
    if (jsonPayload.title && sections[0]?.type === "heading") {
      if (sections[0].text === jsonPayload.title) {
        sections = sections.slice(1)
      }
    }

    const document = buildDocument({
      title: jsonPayload.title || options.titleHint || "成果物",
      summary: jsonPayload.summary,
      sections,
      artifactType: jsonPayload.type || artifactType,
      sourceFormat: jsonPayload.sourceFormat,
      id: options.id,
    })
    const plainText = sectionsToPlainText(document)
    return {
      document,
      sourceFormat: jsonPayload.sourceFormat,
      warnings,
      normalizedSuccessfully: plainText.length > 0,
      plainText,
    }
  }

  // 2) Markdown path
  const cleaned = sanitizeText(raw)
  if (looksLikeMarkdown(cleaned)) {
    const md = parseMarkdownToSections(cleaned)
    const sections = md.sections
    const document = buildDocument({
      title: md.title || options.titleHint || "成果物",
      sections:
        sections[0]?.type === "heading" && sections[0].text === (md.title || "")
          ? sections.slice(1)
          : sections,
      artifactType,
      sourceFormat: "markdown",
      id: options.id,
    })
    // Keep first h1 in sections if it was the only structure signal
    if (document.sections.length === 0 && md.sections.length > 0) {
      document.sections = md.sections
    }
    const plainText = sectionsToPlainText(document)
    return {
      document,
      sourceFormat: "markdown",
      warnings,
      normalizedSuccessfully: plainText.length > 0,
      plainText,
    }
  }

  // 3) Plain text fallback
  const sections = plainTextToSections(cleaned)
  const document = buildDocument({
    title: options.titleHint || "成果物",
    sections,
    artifactType,
    sourceFormat: "plain",
    id: options.id,
  })
  const plainText = sectionsToPlainText(document)
  if (!plainText) {
    warnings.push({
      code: "fallback_empty",
      message: "Normalization produced empty plain text",
    })
  }
  return {
    document,
    sourceFormat: "plain",
    warnings,
    normalizedSuccessfully: plainText.length > 0,
    plainText,
  }
}

/** Convert structured document back to clean markdown (shared export source). */
export function structuredDocumentToMarkdown(doc: StructuredDocument): string {
  const lines: string[] = []
  if (doc.title) lines.push(`# ${doc.title}`, "")
  if (doc.summary) lines.push("## 概要", "", doc.summary, "")
  for (const section of doc.sections) {
    switch (section.type) {
      case "heading":
        lines.push(`${"#".repeat(section.level)} ${section.text}`, "")
        break
      case "paragraph":
        lines.push(section.text, "")
        break
      case "quote":
        lines.push(
          ...section.text.split("\n").map((l) => `> ${l}`),
          "",
        )
        break
      case "bulletList":
        for (const item of section.items) lines.push(`- ${item}`)
        lines.push("")
        break
      case "numberedList":
        section.items.forEach((item, idx) => lines.push(`${idx + 1}. ${item}`))
        lines.push("")
        break
      case "table": {
        if (section.headers.length) {
          lines.push(`| ${section.headers.join(" | ")} |`)
          lines.push(`| ${section.headers.map(() => "---").join(" | ")} |`)
        }
        for (const row of section.rows) {
          lines.push(`| ${row.join(" | ")} |`)
        }
        lines.push("")
        break
      }
      case "pageBreak":
        lines.push("", "---", "")
        break
    }
  }
  return `${lines.join("\n").trim()}\n`
}

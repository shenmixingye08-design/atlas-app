import type { DocumentSection } from "./types"
import { sanitizeText } from "./sanitize"

const HEADING = /^(#{1,3})\s+(.+)$/
const BULLET = /^[-*•]\s+(.+)$/
const NUMBERED = /^\d+[.)]\s+(.+)$/
const TABLE_SEP = /^\|?[\s:-]+\|[\s|:-]+$/
const HR = /^-{3,}$/
const QUOTE = /^>\s?(.*)$/

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim())
}

function isTableRow(line: string): boolean {
  return line.includes("|") && !TABLE_SEP.test(line.trim())
}

/**
 * Convert markdown / plain text into flat DocumentSection list.
 */
export function parseMarkdownToSections(markdown: string): {
  title: string | null
  sections: DocumentSection[]
} {
  const text = sanitizeText(markdown).replace(/\r\n/g, "\n")
  const lines = text.split("\n")
  const sections: DocumentSection[] = []
  let title: string | null = null
  let i = 0

  while (i < lines.length) {
    const raw = lines[i] ?? ""
    const line = raw.trimEnd()
    const trimmed = line.trim()

    if (!trimmed || HR.test(trimmed) || TABLE_SEP.test(trimmed)) {
      i += 1
      continue
    }

    const heading = trimmed.match(HEADING)
    if (heading) {
      const level = heading[1]!.length as 1 | 2 | 3
      const textValue = heading[2]!.trim()
      if (level === 1 && !title) {
        title = textValue
      }
      sections.push({ type: "heading", level, text: textValue })
      i += 1
      continue
    }

    const quote = trimmed.match(QUOTE)
    if (quote) {
      const parts: string[] = [quote[1] ?? ""]
      i += 1
      while (i < lines.length) {
        const m = lines[i]?.trim().match(QUOTE)
        if (!m) break
        parts.push(m[1] ?? "")
        i += 1
      }
      sections.push({ type: "quote", text: parts.join("\n").trim() })
      continue
    }

    if (isTableRow(trimmed)) {
      const tableLines: string[] = []
      while (i < lines.length) {
        const row = (lines[i] ?? "").trim()
        if (!row) break
        if (TABLE_SEP.test(row)) {
          i += 1
          continue
        }
        if (!isTableRow(row)) break
        tableLines.push(row)
        i += 1
      }
      if (tableLines.length > 0) {
        const headers = parseTableRow(tableLines[0]!)
        const rows = tableLines.slice(1).map(parseTableRow)
        sections.push({ type: "table", headers, rows })
      }
      continue
    }

    if (BULLET.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i]?.trim().match(BULLET)
        if (!m) break
        items.push(m[1]!.trim())
        i += 1
      }
      sections.push({ type: "bulletList", items })
      continue
    }

    if (NUMBERED.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length) {
        const m = lines[i]?.trim().match(NUMBERED)
        if (!m) break
        items.push(m[1]!.trim())
        i += 1
      }
      sections.push({ type: "numberedList", items })
      continue
    }

    const para: string[] = [trimmed]
    i += 1
    while (i < lines.length) {
      const next = lines[i]?.trim() ?? ""
      if (
        !next ||
        HEADING.test(next) ||
        BULLET.test(next) ||
        NUMBERED.test(next) ||
        isTableRow(next) ||
        QUOTE.test(next) ||
        HR.test(next)
      ) {
        break
      }
      para.push(next)
      i += 1
    }
    sections.push({ type: "paragraph", text: para.join("\n") })
  }

  return { title, sections: dedupeHeadings(dropEmpty(sections)) }
}

function dropEmpty(sections: DocumentSection[]): DocumentSection[] {
  return sections.filter((s) => {
    if (s.type === "paragraph" || s.type === "quote" || s.type === "heading") {
      return s.text.trim().length > 0
    }
    if (s.type === "bulletList" || s.type === "numberedList") {
      return s.items.some((item) => item.trim())
    }
    if (s.type === "table") {
      return s.headers.length > 0 || s.rows.length > 0
    }
    return true
  })
}

function dedupeHeadings(sections: DocumentSection[]): DocumentSection[] {
  const out: DocumentSection[] = []
  let lastHeading: string | null = null
  for (const section of sections) {
    if (section.type === "heading") {
      const key = `${section.level}:${section.text}`
      if (key === lastHeading) continue
      lastHeading = key
    } else {
      lastHeading = null
    }
    out.push(section)
  }
  return out
}

export function plainTextToSections(text: string): DocumentSection[] {
  const cleaned = sanitizeText(text)
  if (!cleaned) return []
  return cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: "paragraph" as const, text: p }))
}

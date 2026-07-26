/** Remove control chars (except tab/newline) and broken surrogates. */
export function stripControlCharacters(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\uD800-\uDFFF]/g, "")
}

/** Decode common escape sequences when content still has literal \\n. */
export function unescapeLiteralEscapes(text: string): string {
  let next = text
  // Only treat as escaped when backslash-n appears as two chars (not real newlines).
  if (next.includes("\\n") || next.includes("\\t") || next.includes('\\"')) {
    next = next
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
  }
  return next
}

export function stripCodeFences(text: string): string {
  let next = text.trim()
  const fenced = next.match(/^```(?:json|markdown|md|text)?\s*\n([\s\S]*?)\n```$/i)
  if (fenced?.[1]) return fenced[1].trim()
  // Leading/trailing fences without full wrap
  next = next.replace(/^```(?:json|markdown|md|text)?\s*\n/i, "")
  next = next.replace(/\n```\s*$/i, "")
  return next.trim()
}

export function stripWrappingQuotes(text: string): string {
  const trimmed = text.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim()
}

export function sanitizeText(text: string): string {
  return collapseBlankLines(
    decodeHtmlEntities(
      unescapeLiteralEscapes(stripControlCharacters(stripCodeFences(text))),
    ),
  )
}

import { extractVisibleTextFromHtml } from "./html-renderer"
import type { StructuredDocument } from "./types"

export type HtmlValidationResult = {
  ok: boolean
  reasons: string[]
  visibleTextLength: number
  hasTitle: boolean
}

export function validateCanonicalHtml(
  html: string,
  doc: StructuredDocument,
): HtmlValidationResult {
  const reasons: string[] = []
  const visible = extractVisibleTextFromHtml(html)
  const hasTitle =
    /<h1[^>]*>[\s\S]*?\S[\s\S]*?<\/h1>/i.test(html) || doc.title.trim().length > 0

  if (visible.length === 0) reasons.push("no_visible_text")
  if (!hasTitle) reasons.push("missing_title")
  if (/color\s*:\s*transparent/i.test(html)) reasons.push("transparent_text")
  if (/font-size\s*:\s*0(px|pt|em|rem)?/i.test(html)) reasons.push("zero_font_size")
  if (/opacity\s*:\s*0\b/i.test(html)) reasons.push("zero_opacity")
  // Body content must not be entirely display:none
  if (/<body[^>]*style="[^"]*display\s*:\s*none/i.test(html)) {
    reasons.push("body_display_none")
  }
  if (/prefers-color-scheme\s*:\s*dark/i.test(html)) {
    reasons.push("dark_mode_css")
  }
  if (/<button\b/i.test(html)) reasons.push("ui_button_present")
  if (/<nav\b/i.test(html)) reasons.push("nav_present")

  return {
    ok: reasons.length === 0 && visible.length > 0 && hasTitle,
    reasons,
    visibleTextLength: visible.length,
    hasTitle,
  }
}

export function documentPlainTextLength(doc: StructuredDocument): number {
  let n = doc.title.length + (doc.summary?.length ?? 0)
  for (const s of doc.sections) {
    if (s.type === "heading" || s.type === "paragraph" || s.type === "quote") {
      n += s.text.length
    } else if (s.type === "bulletList" || s.type === "numberedList") {
      n += s.items.join("").length
    } else if (s.type === "table") {
      n += s.headers.join("").length
      n += s.rows.flat().join("").length
    }
  }
  return n
}

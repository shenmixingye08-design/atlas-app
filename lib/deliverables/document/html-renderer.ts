import type { DocumentSection, StructuredDocument } from "./types"
import { CANONICAL_HTML_VERSION } from "./types"
import { PRINT_STYLES } from "../export/print-styles"

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function sectionToHtml(section: DocumentSection): string {
  switch (section.type) {
    case "heading": {
      const tag = `h${section.level}` as "h1" | "h2" | "h3"
      return `<${tag}>${escapeHtml(section.text)}</${tag}>`
    }
    case "paragraph":
      return `<p>${escapeHtml(section.text).replace(/\n/g, "<br />")}</p>`
    case "quote":
      return `<blockquote><p>${escapeHtml(section.text).replace(/\n/g, "<br />")}</p></blockquote>`
    case "bulletList":
      return `<ul>${section.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
    case "numberedList":
      return `<ol>${section.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ol>`
    case "table": {
      const head = section.headers.length
        ? `<thead><tr>${section.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`
        : ""
      const body = `<tbody>${section.rows
        .map(
          (row) =>
            `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`,
        )
        .join("")}</tbody>`
      return `<table>${head}${body}</table>`
    }
    case "pageBreak":
      return `<div class="page-break"></div>`
  }
}

export type CanonicalHtmlResult = {
  html: string
  bodyHtml: string
  version: string
  length: number
}

/** Print-safe Canonical HTML shared by Web / Word intermediate / PDF. */
export function renderCanonicalHtml(doc: StructuredDocument): CanonicalHtmlResult {
  const bodyParts: string[] = []
  bodyParts.push(`<header class="doc-header"><h1>${escapeHtml(doc.title)}</h1></header>`)
  if (doc.summary?.trim()) {
    bodyParts.push(
      `<section class="doc-summary"><h2>概要</h2><p>${escapeHtml(doc.summary)}</p></section>`,
    )
  }
  bodyParts.push(`<main class="doc-body">`)
  for (const section of doc.sections) {
    bodyParts.push(sectionToHtml(section))
  }
  bodyParts.push(`</main>`)

  const bodyHtml = bodyParts.join("\n")
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(doc.title)}</title>
<style>
${PRINT_STYLES}
</style>
</head>
<body>
<article class="canonical-document" data-renderer="${CANONICAL_HTML_VERSION}">
${bodyHtml}
</article>
</body>
</html>`

  return {
    html,
    bodyHtml,
    version: CANONICAL_HTML_VERSION,
    length: html.length,
  }
}

export function extractVisibleTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

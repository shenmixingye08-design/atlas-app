import { estimateTokens } from "@/lib/ai/cost-meter"
import {
  MAX_ENTRY_CHARS,
  MAX_REFERENCE_EXCERPT_CHARS,
} from "@/lib/quality-engine/context/config"
import type { NormalizedKnowledgeEntry } from "@/lib/quality-engine/knowledge/types"

const PROTECTED_PATTERNS = [
  /\d{1,3}(?:,\d{3})+(?:\.\d+)?/g, // amounts
  /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/g,
  /禁止[^\n]{0,80}/g,
  /必須[^\n]{0,80}/g,
]

function stripHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

function dedupeLines(text: string): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of text.split("\n")) {
    const key = line.trim().toLowerCase()
    if (!key) {
      if (out.length && out[out.length - 1] !== "") out.push("")
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    out.push(line.trimEnd())
  }
  return out.join("\n").trim()
}

function extractProtectedSnippets(text: string): string[] {
  const found: string[] = []
  for (const re of PROTECTED_PATTERNS) {
    const copy = new RegExp(re.source, re.flags)
    let m: RegExpExecArray | null
    while ((m = copy.exec(text)) !== null) {
      found.push(m[0])
      if (found.length > 40) break
    }
  }
  return found
}

function truncatePreservingProtected(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const protectedBits = extractProtectedSnippets(text)
  let head = text.slice(0, Math.max(0, maxChars - 80))
  const missing = protectedBits.filter((b) => !head.includes(b)).slice(0, 8)
  if (missing.length) {
    head = `${head}\n[保護情報]\n${missing.join(" / ")}`
  }
  return `${head}\n[...truncated]`
}

function compressEntryBody(
  entry: NormalizedKnowledgeEntry,
  assignmentKeywords: readonly string[],
): string {
  let body = stripHtml(entry.body)
  body = collapseWhitespace(body)
  body = dedupeLines(body)

  const max =
    entry.layer === "reference"
      ? MAX_REFERENCE_EXCERPT_CHARS
      : MAX_ENTRY_CHARS

  if (entry.layer === "reference" && assignmentKeywords.length) {
    const lines = body.split("\n")
    const relevant = lines.filter((line) => {
      const lower = line.toLowerCase()
      return assignmentKeywords.some((k) => lower.includes(k.toLowerCase()))
    })
    if (relevant.length >= 2) {
      // Keep heading-ish nearby lines + matches
      body = relevant.join("\n")
    }
  }

  // Drop empty placeholder fields
  body = body
    .split("\n")
    .filter((line) => {
      const t = line.trim()
      if (!t) return true
      if (/^[-*]\s*$/.test(t)) return false
      if (/[:：]\s*$/.test(t)) return false
      if (/^(n\/a|なし|未設定|null|undefined)$/i.test(t)) return false
      return true
    })
    .join("\n")

  return truncatePreservingProtected(collapseWhitespace(body), max)
}

/** Compress selected entries without LLM. */
export function compressKnowledgeEntries(
  entries: readonly NormalizedKnowledgeEntry[],
  assignment = "",
): NormalizedKnowledgeEntry[] {
  const keywords = assignment
    .toLowerCase()
    .split(/[^\p{L}\p{N}_+-]+/u)
    .filter((t) => t.length >= 2)
    .slice(0, 30)

  const companyBodies: string[] = []
  const ruleBodies: string[] = []
  const out: NormalizedKnowledgeEntry[] = []

  for (const entry of entries) {
    const body = compressEntryBody(entry, keywords)

    if (entry.layer === "company" || entry.layer === "business_profile") {
      const key = body.toLowerCase().slice(0, 160)
      if (companyBodies.some((b) => b.includes(key) || key.includes(b))) {
        continue
      }
      companyBodies.push(key)
    }

    if (entry.layer === "rules") {
      const key = body.toLowerCase().slice(0, 160)
      if (ruleBodies.some((b) => b === key)) continue
      ruleBodies.push(key)
    }

    out.push({
      ...entry,
      body,
      meta: {
        ...entry.meta,
        estimatedTokens: estimateTokens(body),
      },
    })
  }

  return out
}

export function compressPackedText(text: string): string {
  return collapseWhitespace(dedupeLines(stripHtml(text)))
}

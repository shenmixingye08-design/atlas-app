import type { NormalizedKnowledgeEntry } from "@/lib/quality-engine/knowledge/types"
import type { QualityPromptKind } from "@/lib/quality-engine/types"
import { getArtifactContextRule } from "@/lib/quality-engine/context/rules"
import type {
  ArtifactContextRule,
  ExclusionReasonCode,
  SelectionReasonCode,
  ScoredKnowledgeCandidate,
} from "@/lib/quality-engine/context/types"

const EVERGREEN_LAYERS = new Set([
  "brand",
  "design",
  "rules",
  "business_profile",
  "user_instruction",
])

const STALE_SENSITIVE_TAGS = [
  "price",
  "pricing",
  "campaign",
  "law",
  "legal_update",
  "stat",
  "market",
  "subsidy",
  "plan",
]

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_+-]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

function keywordOverlapScore(
  haystack: string,
  needles: readonly string[],
): { score: number; hit: boolean } {
  if (!needles.length || !haystack.trim()) return { score: 0, hit: false }
  const lower = haystack.toLowerCase()
  let hits = 0
  for (const n of needles) {
    if (!n) continue
    if (lower.includes(n.toLowerCase())) hits += 1
  }
  if (hits === 0) return { score: 0, hit: false }
  return { score: Math.min(25, hits * 5), hit: true }
}

function freshnessScore(
  entry: NormalizedKnowledgeEntry,
  nowMs: number,
): { score: number; stale: boolean } {
  const { expiresAt, updatedAt, tags, category } = entry.meta
  if (expiresAt) {
    const exp = Date.parse(expiresAt)
    if (Number.isFinite(exp) && exp < nowMs) {
      return { score: -20, stale: true }
    }
  }

  const sensitive =
    STALE_SENSITIVE_TAGS.some((t) => tags.includes(t) || category.includes(t)) ||
    /価格|料金|法令|統計|市場|キャンペーン|補助金/.test(
      `${entry.title}\n${entry.body}`,
    )

  if (EVERGREEN_LAYERS.has(entry.layer) && !sensitive) {
    return { score: 8, stale: false }
  }

  const updated = Date.parse(updatedAt)
  if (!Number.isFinite(updated)) return { score: 0, stale: false }
  const ageDays = (nowMs - updated) / (24 * 60 * 60 * 1000)
  if (!sensitive) {
    if (ageDays > 365) return { score: -2, stale: false }
    return { score: 4, stale: false }
  }
  if (ageDays > 180) return { score: -12, stale: true }
  if (ageDays > 90) return { score: -6, stale: false }
  return { score: 6, stale: false }
}

function isHardExcluded(
  entry: NormalizedKnowledgeEntry,
  rule: ArtifactContextRule,
  promptKind: QualityPromptKind,
): ExclusionReasonCode | null {
  if (!entry.meta.enabled) return "disabled"

  if (rule.excludeLayers.includes(entry.layer)) return "artifact_type_mismatch"
  if (rule.excludeCategories.includes(entry.meta.category)) {
    return "artifact_type_mismatch"
  }
  if (entry.meta.tags.some((t) => rule.excludeTags.includes(t))) {
    return "artifact_type_mismatch"
  }

  const kinds = entry.kinds?.length
    ? entry.kinds
    : entry.meta.artifactTypes
  if (
    kinds.length > 0 &&
    !kinds.includes(promptKind) &&
    entry.layer === "deliverable" &&
    !entry.meta.required
  ) {
    return "artifact_type_mismatch"
  }

  return null
}

function isRequiredEntry(entry: NormalizedKnowledgeEntry): boolean {
  if (entry.meta.required) return true
  if (entry.layer === "user_instruction") return true
  if (entry.layer === "business_profile") return true
  if (
    entry.layer === "rules" &&
    /禁止|法務|安全|コンプライアンス|必須/.test(`${entry.title}\n${entry.body}`)
  ) {
    return true
  }
  return false
}

/** Deterministic score for one Knowledge candidate. No LLM. */
export function scoreKnowledgeCandidate(input: {
  entry: NormalizedKnowledgeEntry
  promptKind: QualityPromptKind
  assignment: string
  nowMs?: number
}): ScoredKnowledgeCandidate {
  const nowMs = input.nowMs ?? Date.now()
  const rule = getArtifactContextRule(input.promptKind)
  const entry = input.entry
  const reasons: SelectionReasonCode[] = []
  const exclusionReasons: ExclusionReasonCode[] = []
  const required = isRequiredEntry(entry)

  const hard = isHardExcluded(entry, rule, input.promptKind)
  if (hard && !required) {
    return {
      entry,
      score: -100,
      required: false,
      reasons: [],
      exclusionReasons: [hard],
      selected: false,
      estimatedTokens: entry.meta.estimatedTokens,
    }
  }

  let score = 0

  const kinds = entry.kinds?.length
    ? entry.kinds
    : entry.meta.artifactTypes
  if (kinds.length === 0 || kinds.includes(input.promptKind)) {
    score += 20
    reasons.push("artifact_type_match")
  } else if (!required) {
    score -= 15
  }

  const assignmentTokens = tokenize(input.assignment)
  const bodyHay = `${entry.title}\n${entry.body}\n${entry.meta.tags.join(" ")}`
  const kw = keywordOverlapScore(bodyHay, [
    ...assignmentTokens.slice(0, 40),
    ...rule.keywordBoosts,
  ])
  if (kw.hit) {
    score += kw.score
    reasons.push("keyword_match")
  }

  if (rule.preferLayers.includes(entry.layer)) {
    score += 12
    reasons.push("category_match")
  }
  if (rule.preferCategories.includes(entry.meta.category)) {
    score += 8
  }

  const tagHits = entry.meta.tags.filter((t) => rule.preferTags.includes(t))
  if (tagHits.length) {
    score += Math.min(15, tagHits.length * 5)
    reasons.push("tag_match")
  }

  const priorityScore = Math.min(15, Math.round(entry.meta.priority / 7))
  score += priorityScore
  if (entry.meta.priority >= 80) reasons.push("high_priority")

  const confidenceScore = Math.min(10, Math.round(entry.meta.confidence / 10))
  score += confidenceScore
  if (entry.meta.confidence >= 80) reasons.push("confidence")

  const fresh = freshnessScore(entry, nowMs)
  score += fresh.score
  if (fresh.score > 0) reasons.push("freshness")
  if (fresh.stale && !required) {
    exclusionReasons.push("stale")
    score -= 10
  }

  if (required) {
    score += 40
    reasons.push("required_rule")
    if (entry.layer === "user_instruction") reasons.push("user_instruction")
    if (entry.layer === "business_profile") reasons.push("business_profile")
  }

  if (entry.layer === "reference") {
    score += 10
    reasons.push("reference_match")
  }

  if (entry.layer === "past_deliverables") {
    score += 4
    reasons.push("past_usage")
  }

  return {
    entry,
    score,
    required,
    reasons: Array.from(new Set(reasons)),
    exclusionReasons: Array.from(new Set(exclusionReasons)),
    selected: false,
    estimatedTokens: entry.meta.estimatedTokens,
  }
}

export function scoreAllCandidates(input: {
  candidates: readonly NormalizedKnowledgeEntry[]
  promptKind: QualityPromptKind
  assignment: string
  nowMs?: number
}): ScoredKnowledgeCandidate[] {
  return input.candidates.map((entry) =>
    scoreKnowledgeCandidate({
      entry,
      promptKind: input.promptKind,
      assignment: input.assignment,
      nowMs: input.nowMs,
    }),
  )
}

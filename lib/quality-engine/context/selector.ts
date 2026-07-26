import { estimateTokens } from "@/lib/ai/cost-meter"
import { applyContextBudget, sumSelectedTokens } from "@/lib/quality-engine/context/budget"
import {
  buildSmartContextCacheKey,
  fingerprintText,
  getSmartContextCache,
  setSmartContextCache,
} from "@/lib/quality-engine/context/cache"
import { compressKnowledgeEntries, compressPackedText } from "@/lib/quality-engine/context/compressor"
import { getContextTokenBudget } from "@/lib/quality-engine/context/config"
import { resolveContextConflicts } from "@/lib/quality-engine/context/conflict-resolver"
import { scoreAllCandidates } from "@/lib/quality-engine/context/scorer"
import type {
  ScoredKnowledgeCandidate,
  SmartContextSelectionResult,
  SmartContextStats,
} from "@/lib/quality-engine/context/types"
import {
  buildKnowledgeUsage,
  buildMergedTextFromEntries,
} from "@/lib/quality-engine/knowledge/merge"
import type {
  MergedKnowledgePack,
  NormalizedKnowledgeEntry,
} from "@/lib/quality-engine/knowledge/types"
import type { QualityPromptKind } from "@/lib/quality-engine/types"

export type SelectSmartContextInput = {
  candidates: readonly NormalizedKnowledgeEntry[]
  promptKind: QualityPromptKind
  assignment?: string
  userId?: string
  organizationId?: string | null
  language?: string
  /** When true, skip cache read/write (e.g. info-gap refill). */
  bypassCache?: boolean
  /** Force include these entry ids (refill path). */
  forceIncludeIds?: readonly string[]
  nowMs?: number
}

function buildStats(input: {
  scored: readonly ScoredKnowledgeCandidate[]
  promptKind: QualityPromptKind
  packedText: string
  compressedText: string
  cacheHit: boolean
  selectionMs: number
  refillUsed: boolean
}): SmartContextStats {
  const selected = input.scored.filter((s) => s.selected)
  const requiredCount = selected.filter((s) => s.required).length
  const usedLayers = Array.from(new Set(selected.map((s) => s.entry.layer)))
  const usedCategories = Array.from(
    new Set(selected.map((s) => s.entry.meta.category)),
  )
  const pre = input.packedText.length
  const post = input.compressedText.length
  return {
    candidateCount: input.scored.length,
    selectedCount: selected.length,
    excludedCount: input.scored.length - selected.length,
    requiredCount,
    budgetTokens: getContextTokenBudget(input.promptKind),
    estimatedInputTokens: estimateTokens(input.compressedText),
    preCompressChars: pre,
    postCompressChars: post,
    reductionRate: pre > 0 ? Math.round(((pre - post) / pre) * 1000) / 10 : 0,
    usedCategories,
    usedLayers,
    usedReferenceCount: selected.filter((s) => s.entry.layer === "reference")
      .length,
    usedTemplate: selected.some((s) => s.entry.layer === "template"),
    usedPastArtifactCount: selected.filter(
      (s) => s.entry.layer === "past_deliverables",
    ).length,
    cacheHit: input.cacheHit,
    selectionMs: input.selectionMs,
    extraLlmCalls: 0,
    refillUsed: input.refillUsed,
  }
}

/**
 * Smart Context selection — rule-based only, no OpenAI calls.
 */
export function selectSmartContext(
  input: SelectSmartContextInput,
): SmartContextSelectionResult {
  const started = Date.now()
  const assignment = (input.assignment ?? "").trim()
  const userId = input.userId ?? ""
  const language = input.language ?? "ja"
  const refillUsed = Boolean(input.forceIncludeIds?.length)

  const knowledgeFingerprint = fingerprintText(
    input.candidates
      .map(
        (c) =>
          `${c.id}:${c.meta.version}:${c.meta.updatedAt}:${c.body.slice(0, 80)}`,
      )
      .sort()
      .join("|"),
  )
  const referenceFingerprint = fingerprintText(
    input.candidates
      .filter((c) => c.layer === "reference")
      .map((c) => c.body)
      .join("|"),
  )
  const templateFingerprint = fingerprintText(
    input.candidates
      .filter((c) => c.layer === "template")
      .map((c) => c.body)
      .join("|"),
  )
  const businessProfileFingerprint = fingerprintText(
    input.candidates
      .filter((c) => c.layer === "business_profile")
      .map((c) => c.body)
      .join("|"),
  )
  const assignmentFingerprint = fingerprintText(
    `${input.promptKind}|${language}|${assignment.slice(0, 500)}`,
  )

  const cacheKey = buildSmartContextCacheKey({
    userId,
    organizationId: input.organizationId,
    promptKind: input.promptKind,
    language,
    assignmentFingerprint,
    knowledgeFingerprint,
    referenceFingerprint,
    templateFingerprint,
    businessProfileFingerprint,
  })

  if (!input.bypassCache && userId) {
    const cached = getSmartContextCache(
      cacheKey,
      userId,
      input.organizationId,
    )
    if (cached) return cached
  }

  let scored = scoreAllCandidates({
    candidates: input.candidates,
    promptKind: input.promptKind,
    assignment,
    nowMs: input.nowMs,
  })

  // Force-include for info-gap refill (max 1 retry caller-side)
  if (input.forceIncludeIds?.length) {
    const force = new Set(input.forceIncludeIds)
    scored = scored.map((s) => {
      if (!force.has(s.entry.id)) return s
      return {
        ...s,
        selected: true,
        required: true,
        exclusionReasons: [],
        reasons: Array.from(
          new Set([...s.reasons, "info_gap_refill" as const]),
        ),
      }
    })
  }

  scored = applyContextBudget({
    scored,
    promptKind: input.promptKind,
  })

  // Ensure force-includes survived budget (required already does)
  if (input.forceIncludeIds?.length) {
    const force = new Set(input.forceIncludeIds)
    scored = scored.map((s) =>
      force.has(s.entry.id)
        ? {
            ...s,
            selected: true,
            required: true,
          }
        : s,
    )
  }

  scored = resolveContextConflicts(scored)

  const selectedEntries = scored
    .filter((s) => s.selected)
    .map((s) => s.entry)
    // Stable order by merge priority handled later; keep score order for packing
    .sort((a, b) => a.id.localeCompare(b.id))

  const compressedEntries = compressKnowledgeEntries(
    selectedEntries,
    assignment,
  )
  const packed = buildMergedTextFromEntries(selectedEntries)
  const compressedPacked = buildMergedTextFromEntries(compressedEntries)
  const packedText = packed.mergedText
  const compressedText = compressPackedText(compressedPacked.mergedText)

  // Align scored.selected bodies with compression (for telemetry detail)
  const compressedById = new Map(compressedEntries.map((e) => [e.id, e]))
  scored = scored.map((s) => {
    if (!s.selected) return s
    const next = compressedById.get(s.entry.id)
    if (!next) {
      return {
        ...s,
        selected: false,
        exclusionReasons: Array.from(
          new Set([...s.exclusionReasons, "compressed_away" as const]),
        ),
      }
    }
    return {
      ...s,
      entry: next,
      estimatedTokens: next.meta.estimatedTokens,
    }
  })

  const stats = buildStats({
    scored,
    promptKind: input.promptKind,
    packedText,
    compressedText,
    cacheHit: false,
    selectionMs: Date.now() - started,
    refillUsed,
  })

  // Recompute estimated tokens from final selected set
  stats.estimatedInputTokens = Math.max(
    estimateTokens(compressedText),
    sumSelectedTokens(scored),
  )

  const result: SmartContextSelectionResult = {
    selected: scored.filter((s) => s.selected).map((s) => s.entry),
    scored,
    packedText,
    compressedText,
    stats,
  }

  if (!input.bypassCache && userId) {
    setSmartContextCache({
      key: cacheKey,
      userId,
      organizationId: input.organizationId,
      result,
      fingerprints: {
        knowledge: knowledgeFingerprint,
        reference: referenceFingerprint,
        template: templateFingerprint,
        businessProfile: businessProfileFingerprint,
        assignment: assignmentFingerprint,
        promptKind: input.promptKind,
        language,
      },
    })
  }

  return result
}

/** Build MergedKnowledgePack from Smart Context selection. */
export function toMergedKnowledgePack(
  selection: SmartContextSelectionResult,
  flags: {
    businessProfile: boolean
    reference: boolean
    template: boolean
    vision: boolean
    pastDeliverables: boolean
    userSettings: boolean
  },
): MergedKnowledgePack {
  const built = buildMergedTextFromEntries(selection.selected)
  const usage = buildKnowledgeUsage({
    layersUsed: built.layersUsed,
    entryCount: selection.stats.candidateCount,
    contextChars: selection.compressedText.length,
    ...flags,
  })
  return {
    sections: built.sections,
    mergedText: selection.compressedText || built.mergedText,
    usage,
    candidates: selection.scored.map((s) => s.entry),
  }
}

/**
 * Pick next-best excluded candidates for info-gap refill (no LLM).
 */
export function pickRefillCandidateIds(
  scored: readonly ScoredKnowledgeCandidate[],
  max = 3,
): string[] {
  return [...scored]
    .filter(
      (s) =>
        !s.selected &&
        !s.exclusionReasons.includes("disabled") &&
        !s.exclusionReasons.includes("duplicate") &&
        !s.exclusionReasons.includes("artifact_type_mismatch"),
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.entry.id.localeCompare(b.entry.id)
    })
    .slice(0, max)
    .map((s) => s.entry.id)
}

/** Pick refill ids from owner telemetry decisions (no LLM). */
export function pickRefillIdsFromDecisions(
  decisions: readonly {
    id: string
    selected: boolean
    score: number
    exclusionReasons: readonly string[]
  }[],
  max = 3,
): string[] {
  return [...decisions]
    .filter(
      (d) =>
        !d.selected &&
        !d.exclusionReasons.includes("disabled") &&
        !d.exclusionReasons.includes("duplicate") &&
        !d.exclusionReasons.includes("artifact_type_mismatch"),
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.id.localeCompare(b.id)
    })
    .slice(0, max)
    .map((d) => d.id)
}

export function isInformationGapFeedback(feedback: string): boolean {
  return /情報不足|不足情報|情報が足り|context.?missing|insufficient information/i.test(
    feedback,
  )
}

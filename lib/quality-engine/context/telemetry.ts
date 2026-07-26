import type { SmartContextStats } from "@/lib/quality-engine/context/types"
import type { ScoredKnowledgeCandidate } from "@/lib/quality-engine/context/types"

/** Owner-facing Smart Context snapshot (never shown to end users). */
export type SmartContextTelemetry = {
  candidateCount: number
  selectedCount: number
  excludedCount: number
  requiredCount: number
  budgetTokens: number
  estimatedInputTokens: number
  preCompressChars: number
  postCompressChars: number
  reductionRate: number
  usedCategories: readonly string[]
  usedLayers: readonly string[]
  usedReferenceCount: number
  usedTemplate: boolean
  usedPastArtifactCount: number
  cacheHit: boolean
  selectionMs: number
  /** Always 0 for Smart Context selection itself. */
  extraLlmCalls: number
  refillUsed: boolean
  /** Cost / quality comparison fields (0 or null when unmeasured). */
  actualInputTokens: number
  outputTokens: number
  aiCallCount: number
  model: string
  estimatedApiCostUsd: number | null
  knowledgeEntryCount: number
  referenceCount: number
  qualityScore: number | null
  improveCount: number
  /** Detailed adopt/exclude reasons for owner drill-down. */
  decisions: readonly {
    id: string
    title: string
    layer: string
    selected: boolean
    score: number
    required: boolean
    reasons: readonly string[]
    exclusionReasons: readonly string[]
  }[]
}

export function buildSmartContextTelemetry(input: {
  stats: SmartContextStats
  scored: readonly ScoredKnowledgeCandidate[]
  actualInputTokens?: number
  outputTokens?: number
  aiCallCount?: number
  model?: string
  estimatedApiCostUsd?: number | null
  qualityScore?: number | null
  improveCount?: number
}): SmartContextTelemetry {
  return {
    candidateCount: input.stats.candidateCount,
    selectedCount: input.stats.selectedCount,
    excludedCount: input.stats.excludedCount,
    requiredCount: input.stats.requiredCount,
    budgetTokens: input.stats.budgetTokens,
    estimatedInputTokens: input.stats.estimatedInputTokens,
    preCompressChars: input.stats.preCompressChars,
    postCompressChars: input.stats.postCompressChars,
    reductionRate: input.stats.reductionRate,
    usedCategories: input.stats.usedCategories,
    usedLayers: input.stats.usedLayers,
    usedReferenceCount: input.stats.usedReferenceCount,
    usedTemplate: input.stats.usedTemplate,
    usedPastArtifactCount: input.stats.usedPastArtifactCount,
    cacheHit: input.stats.cacheHit,
    selectionMs: input.stats.selectionMs,
    extraLlmCalls: 0,
    refillUsed: input.stats.refillUsed,
    actualInputTokens: input.actualInputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    aiCallCount: input.aiCallCount ?? 0,
    model: input.model ?? "",
    estimatedApiCostUsd:
      typeof input.estimatedApiCostUsd === "number"
        ? input.estimatedApiCostUsd
        : null,
    knowledgeEntryCount: input.stats.selectedCount,
    referenceCount: input.stats.usedReferenceCount,
    qualityScore:
      typeof input.qualityScore === "number" ? input.qualityScore : null,
    improveCount: input.improveCount ?? 0,
    decisions: input.scored.map((s) => ({
      id: s.entry.id,
      title: s.entry.title,
      layer: s.entry.layer,
      selected: s.selected,
      score: s.score,
      required: s.required,
      reasons: s.reasons,
      exclusionReasons: s.exclusionReasons,
    })),
  }
}

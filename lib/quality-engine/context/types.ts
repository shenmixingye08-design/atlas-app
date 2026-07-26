import type {
  KnowledgeLayerId,
  NormalizedKnowledgeEntry,
} from "@/lib/quality-engine/knowledge/types"
import type { QualityPromptKind } from "@/lib/quality-engine/types"

export type SelectionReasonCode =
  | "artifact_type_match"
  | "keyword_match"
  | "category_match"
  | "tag_match"
  | "high_priority"
  | "required_rule"
  | "user_instruction"
  | "business_profile"
  | "reference_match"
  | "freshness"
  | "confidence"
  | "past_usage"
  | "budget_selected"
  | "conflict_winner"
  | "info_gap_refill"

export type ExclusionReasonCode =
  | "low_relevance"
  | "budget_exceeded"
  | "duplicate"
  | "stale"
  | "artifact_type_mismatch"
  | "disabled"
  | "conflict_loser"
  | "past_artifact_cap"
  | "compressed_away"

export type ScoredKnowledgeCandidate = {
  entry: NormalizedKnowledgeEntry
  score: number
  required: boolean
  reasons: SelectionReasonCode[]
  exclusionReasons: ExclusionReasonCode[]
  selected: boolean
  estimatedTokens: number
}

export type SmartContextStats = {
  candidateCount: number
  selectedCount: number
  excludedCount: number
  requiredCount: number
  budgetTokens: number
  estimatedInputTokens: number
  preCompressChars: number
  postCompressChars: number
  reductionRate: number
  usedCategories: string[]
  usedLayers: KnowledgeLayerId[]
  usedReferenceCount: number
  usedTemplate: boolean
  usedPastArtifactCount: number
  cacheHit: boolean
  selectionMs: number
  extraLlmCalls: number
  refillUsed: boolean
}

export type SmartContextSelectionResult = {
  selected: NormalizedKnowledgeEntry[]
  scored: ScoredKnowledgeCandidate[]
  packedText: string
  compressedText: string
  stats: SmartContextStats
}

export type SmartContextCacheKeyInput = {
  userId: string
  organizationId?: string | null
  promptKind: QualityPromptKind
  language: string
  assignmentFingerprint: string
  knowledgeFingerprint: string
  referenceFingerprint: string
  templateFingerprint: string
  businessProfileFingerprint: string
}

export type ArtifactContextRule = {
  preferLayers: KnowledgeLayerId[]
  preferCategories: string[]
  preferTags: string[]
  excludeLayers: KnowledgeLayerId[]
  excludeCategories: string[]
  excludeTags: string[]
  maxPastArtifacts: number
  keywordBoosts: string[]
}

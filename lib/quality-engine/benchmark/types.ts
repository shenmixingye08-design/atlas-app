import type { QualityPromptKind } from "@/lib/quality-engine/types"

/** Nullable metric — never coerce missing to 0. */
export type MeasurableNumber = number | null

export type BenchmarkFeatureFlags = {
  qualityEngine: boolean
  smartContext: boolean
  knowledge: boolean
  reference: boolean
  template: boolean
  cache: boolean
  reviewer: boolean
  judge: boolean
}

export type BenchmarkVersions = {
  qualityEngineVersion: string
  smartContextVersion: string
  specialistVersion: string
  writerPromptVersion: string
  reviewerPromptVersion: string
  judgePromptVersion: string
  knowledgeVersion: string
  artifactRendererVersion: string
  templateVersion: string
  model: string
}

export type BenchmarkQualityScores = {
  qualityScore: MeasurableNumber
  reviewerScore: MeasurableNumber
  judgeScore: MeasurableNumber
  completenessScore: MeasurableNumber
  accuracyScore: MeasurableNumber
  relevanceScore: MeasurableNumber
  structureScore: MeasurableNumber
  readabilityScore: MeasurableNumber
  designScore: MeasurableNumber
  brandConsistencyScore: MeasurableNumber
  instructionComplianceScore: MeasurableNumber
  informationSufficiencyScore: MeasurableNumber
}

export type BenchmarkProcessing = {
  writerCalls: MeasurableNumber
  reviewerCalls: MeasurableNumber
  judgeCalls: MeasurableNumber
  improvementCount: MeasurableNumber
  retryCount: MeasurableNumber
  totalAiCalls: MeasurableNumber
  extraLlmCalls: MeasurableNumber
  processingTimeMs: MeasurableNumber
  queueTimeMs: MeasurableNumber
  generationTimeMs: MeasurableNumber
}

export type BenchmarkContextInfo = {
  contextCandidateCount: MeasurableNumber
  contextSelectedCount: MeasurableNumber
  contextExcludedCount: MeasurableNumber
  contextRequiredCount: MeasurableNumber
  contextBudget: MeasurableNumber
  estimatedContextTokens: MeasurableNumber
  actualInputTokens: MeasurableNumber
  outputTokens: MeasurableNumber
  cachedContext: boolean | null
  compressionBeforeSize: MeasurableNumber
  compressionAfterSize: MeasurableNumber
  compressionRate: MeasurableNumber
  knowledgeCount: MeasurableNumber
  referenceCount: MeasurableNumber
  pastArtifactCount: MeasurableNumber
}

export type BenchmarkCostInfo = {
  inputCost: MeasurableNumber
  outputCost: MeasurableNumber
  visionCost: MeasurableNumber
  researchCost: MeasurableNumber
  totalApiCost: MeasurableNumber
  estimatedCost: MeasurableNumber
  currency: string
}

export type BenchmarkUsageInfo = {
  downloaded: boolean | null
  downloadCount: MeasurableNumber
  regenerated: boolean | null
  regenerationCount: MeasurableNumber
  userRating: MeasurableNumber
  ownerRating: MeasurableNumber
  userFeedback: string | null
  ownerFeedback: string | null
  acceptedWithoutEdit: boolean | null
  editedAfterGeneration: boolean | null
  editDistance: MeasurableNumber
  finalUsed: boolean | null
  failureReason: string | null
  /** Thumbs feedback reasons (Experience Engine / Owner analytics). */
  positiveReasons?: readonly string[] | null
  negativeReasons?: readonly string[] | null
}

export type RuleEvaluationIssue = {
  code: string
  message: string
  severity: "error" | "warn" | "info"
}

export type RuleEvaluationResult = {
  passed: boolean
  score: number
  checks: readonly {
    id: string
    passed: boolean
    detail: string
  }[]
  issues: readonly RuleEvaluationIssue[]
  evaluatedAt: string
}

export type OwnerUsability =
  | "ready"
  | "minor_edit"
  | "major_edit"
  | "unusable"

export type OwnerEvaluation = {
  overall: number
  accuracy: number
  information: number
  persuasiveness: number
  readability: number
  appearance: number
  brandFit: number
  lowEditNeed: number
  practicalUse: number
  betterThanChatGpt: number
  usability: OwnerUsability
  pros: string
  cons: string
  missingInfo: string
  unnecessaryInfo: string
  nextImprovements: string
  ratedAt: string
  ratedBy: string
}

export type UserRatingLabel = "very_good" | "good" | "ok" | "needs_improvement"

export type UserEvaluation = {
  label: UserRatingLabel
  score: number
  reasons: readonly string[]
  otherText: string | null
  ratedAt: string
  /** Thumbs rating bridge from artifact-feedback (optional). */
  ratingType?: "positive" | "negative"
  positiveReasons?: readonly string[]
  negativeReasons?: readonly string[]
}

export type BenchmarkRecord = {
  id: string
  runId: string | null
  caseId: string | null
  artifactId: string | null
  jobId: string | null
  userId: string | null
  organizationId: string | null
  artifactType: QualityPromptKind | string
  artifactSubType: string | null
  title: string | null
  model: string | null
  status: "completed" | "failed" | "partial" | "running"
  patternLabel: string | null
  featureFlags: BenchmarkFeatureFlags
  versions: BenchmarkVersions
  quality: BenchmarkQualityScores
  processing: BenchmarkProcessing
  contextInfo: BenchmarkContextInfo
  costInfo: BenchmarkCostInfo
  usageInfo: BenchmarkUsageInfo
  ruleEvaluation: RuleEvaluationResult | null
  ownerEvaluation: OwnerEvaluation | null
  userEvaluation: UserEvaluation | null
  knowledgeFingerprint: string | null
  contextFingerprint: string | null
  referenceFingerprint: string | null
  templateId: string | null
  businessProfileVersion: string | null
  createdAt: string
  completedAt: string | null
  /** Internal only — never exported by default. */
  contentExcerpt?: string | null
}

export type BenchmarkCase = {
  id: string
  name: string
  artifactType: QualityPromptKind | string
  request: string
  expectedSections: readonly string[]
  requiredFacts: readonly string[]
  prohibitedExpressions: readonly string[]
  expectedAudience: string | null
  expectedTone: string | null
  requiredOutputFormat: string | null
  references: readonly string[]
  templateId: string | null
  businessProfileId: string | null
  tags: readonly string[]
  enabled: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export type BenchmarkPatternConfig = {
  label: string
  knowledge: boolean
  smartContext: boolean
  reviewer: boolean
  judge: boolean
  template: boolean
  reference: boolean
  maxImproveRounds: number | null
  contextBudget: number | null
  model: string | null
}

export type BenchmarkRunConfig = {
  artifactTypes: readonly string[]
  caseIds: readonly string[]
  patterns: readonly BenchmarkPatternConfig[]
  repeats: number
  tags: readonly string[]
  memo: string
  /** When false (default), only rule-eval / context compare — no Writer LLM. */
  executeGeneration: boolean
  /** Owner-only explicit AI re-judge. */
  aiReevaluate: boolean
}

export type BenchmarkRun = {
  id: string
  createdBy: string
  status: "queued" | "running" | "completed" | "cancelled" | "failed"
  config: BenchmarkRunConfig
  tags: readonly string[]
  memo: string | null
  estimatedMaxCostUsd: MeasurableNumber
  actualCostUsd: MeasurableNumber
  caseCount: number
  patternCount: number
  resultCount: number
  idempotencyKey: string
  startedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export type QualityThreshold = {
  id: string
  artifactType: string
  minQualityScore: number
  warnOnly: boolean
  enabled: boolean
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export type AbComparison = {
  labelA: string
  labelB: string
  recordAId: string
  recordBId: string
  qualityScoreDelta: MeasurableNumber
  apiCostDelta: MeasurableNumber
  inputTokenDelta: MeasurableNumber
  outputTokenDelta: MeasurableNumber
  processingTimeDelta: MeasurableNumber
  improvementCountDelta: MeasurableNumber
  referenceCountDelta: MeasurableNumber
  compressionRateDelta: MeasurableNumber
  ownerRatingDelta: MeasurableNumber
  notes: string
}

export type RegressionSignal = {
  artifactType: string
  status: "alert" | "reference" | "insufficient_data"
  message: string
  metrics: Record<string, MeasurableNumber>
}

export type ImprovementPriorityRow = {
  recordId: string
  artifactType: string
  title: string | null
  priorityScore: number
  reasons: readonly string[]
  quadrant: "high_q_low_c" | "high_q_high_c" | "low_q_low_c" | "low_q_high_c"
}

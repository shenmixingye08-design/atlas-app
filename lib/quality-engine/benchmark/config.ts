import type { QualityPromptKind } from "@/lib/quality-engine/types"

/** Phase / component versions recorded on every Benchmark Record. */
export const QUALITY_ENGINE_VERSION = "5.0.0"
export const SMART_CONTEXT_VERSION = "1.0.0"
export const SPECIALIST_VERSION = "2.0.0"
export const WRITER_PROMPT_VERSION = "2.0.0"
export const REVIEWER_PROMPT_VERSION = "2.0.0"
export const JUDGE_PROMPT_VERSION = "2.0.0"
export const KNOWLEDGE_VERSION = "3.0.0"
export const ARTIFACT_RENDERER_VERSION = "1.0.0"

/** Cost protection defaults for Benchmark Runs (Owner must raise explicitly). */
export const BENCHMARK_COST_LIMITS = {
  maxCasesDefault: 5,
  maxCasesHard: 20,
  maxPatternsDefault: 2,
  maxPatternsHard: 4,
  maxRepeatsDefault: 1,
  maxRepeatsHard: 3,
  maxConcurrentRuns: 1,
  dailyBudgetUsdDefault: 2,
  dailyBudgetUsdHard: 20,
  estimatedCostPerGenerationUsd: 0.08,
  maxRerunFailures: 2,
} as const

/** Default quality gates (warn-only; never infinite regenerate). */
export const DEFAULT_QUALITY_THRESHOLDS: Partial<
  Record<QualityPromptKind, number>
> = {
  sales_material: 85,
  proposal: 85,
  blog: 82,
  contract: 90,
  email: 75,
  sns: 70,
  word: 80,
  pdf: 82,
  excel: 80,
  report: 80,
  generic: 75,
}

/** Minimum samples before regression is asserted (else データ不足). */
export const REGRESSION_MIN_SAMPLES = 5

export const REGRESSION_THRESHOLDS = {
  qualityDropPoints: 5,
  costIncreaseRatio: 0.2,
  regenerateRateIncrease: 0.1,
  durationIncreaseRatio: 0.3,
} as const

export function buildVersionSnapshot(input?: {
  templateVersion?: string | null
  model?: string | null
}): Record<string, string> {
  return {
    qualityEngineVersion: QUALITY_ENGINE_VERSION,
    smartContextVersion: SMART_CONTEXT_VERSION,
    specialistVersion: SPECIALIST_VERSION,
    writerPromptVersion: WRITER_PROMPT_VERSION,
    reviewerPromptVersion: REVIEWER_PROMPT_VERSION,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    knowledgeVersion: KNOWLEDGE_VERSION,
    artifactRendererVersion: ARTIFACT_RENDERER_VERSION,
    templateVersion: input?.templateVersion ?? "unspecified",
    model: input?.model ?? "unmeasured",
  }
}

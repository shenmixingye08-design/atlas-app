import type { QualityPromptKind } from "@/lib/quality-engine/types"

/**
 * Context token budgets by prompt kind.
 * Centralized — do not hardcode budgets elsewhere.
 */
export const CONTEXT_TOKEN_BUDGETS: Record<QualityPromptKind, number> = {
  sns: 1_500,
  email: 2_500,
  blog: 8_000,
  sales_material: 12_000,
  proposal: 12_000,
  planning: 10_000,
  contract: 15_000,
  estimate: 8_000,
  invoice: 6_000,
  excel: 8_000,
  word: 10_000,
  pdf: 12_000,
  report: 10_000,
  receipt: 4_000,
  minutes: 6_000,
  generic: 6_000,
}

/** Max past-deliverable entries injected into Writer context. */
export const PAST_ARTIFACT_CAPS: Record<QualityPromptKind, number> = {
  sales_material: 3,
  proposal: 3,
  planning: 2,
  blog: 3,
  contract: 2,
  email: 2,
  excel: 2,
  word: 2,
  pdf: 2,
  sns: 1,
  estimate: 2,
  invoice: 1,
  report: 2,
  receipt: 1,
  minutes: 1,
  generic: 2,
}

/** Soft cap for a single knowledge entry body (chars) before truncation. */
export const MAX_ENTRY_CHARS = 4_000

/** Soft cap for a single reference excerpt (chars). */
export const MAX_REFERENCE_EXCERPT_CHARS = 2_500

/** Cache TTL for reusable context packs (ms). */
export const SMART_CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000

/** Minimum relevance score for non-required entries (0–100 scale). */
export const MIN_RELEVANCE_SCORE = 18

export function getContextTokenBudget(kind: QualityPromptKind): number {
  return CONTEXT_TOKEN_BUDGETS[kind] ?? CONTEXT_TOKEN_BUDGETS.generic
}

export function getPastArtifactCap(kind: QualityPromptKind): number {
  return PAST_ARTIFACT_CAPS[kind] ?? PAST_ARTIFACT_CAPS.generic
}

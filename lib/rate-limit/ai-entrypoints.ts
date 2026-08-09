/**
 * Canonical list of AI/OpenAI HTTP entrypoints that MUST call enforceAiRateLimit.
 * Used by integrity tests / health probe static guarantee checks.
 */
export const AI_RATE_LIMIT_ENTRYPOINTS = [
  "app/api/commander/route.ts",
  "app/api/orchestrate/route.ts",
  "app/api/responses/route.ts",
  "app/api/vision/analyze/route.ts",
  "app/api/receipt/process/route.ts",
  "app/api/sales-material/outline/route.ts",
  "app/api/deliverables/generate/route.ts",
  "app/api/deliverables/word/regenerate/route.ts",
] as const;

export type AiRateLimitEntrypoint = (typeof AI_RATE_LIMIT_ENTRYPOINTS)[number];

import "server-only";

import { resolveModelFromTier } from "@/lib/ai/model-catalog";

/**
 * Explicit Vision model selection — do not reuse planner/worker routing.
 * OPENAI_VISION_MODEL overrides the catalog strong-tier default when set.
 */
export function resolveVisionModel(): string {
  const fromEnv = process.env.OPENAI_VISION_MODEL?.trim();
  if (fromEnv) return fromEnv;
  // Catalog strong model (currently gpt-5.5) supports Responses API image input.
  return resolveModelFromTier("strong").model;
}

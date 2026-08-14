/**
 * Vision cost estimate using existing MODEL_CATALOG + cost-meter SoT.
 * Does NOT invent official image-token prices.
 */

import { estimateTokenCostUsd, MODEL_CATALOG } from "@/lib/ai/model-catalog";
import { resolveTaskPolicy } from "@/lib/ai/policy-engine";
import {
  estimateImageInputTokens,
  estimateVisionCostUsd,
} from "@/lib/vision/cost";
import type { VisionDetailLevel } from "@/lib/vision/types";

export const VISION_IMAGE_TOKEN_PRICE_NOTE =
  "MODEL PRICE SOURCE REQUIRED — catalog has text-token USD only; image-tile prices are not in MODEL_CATALOG.";

export type VisionCostFixtureEstimate = {
  name: string;
  model: string;
  imageDetail: VisionDetailLevel;
  imageCount: number;
  aiCalls: number;
  inputTokens: number;
  imageTokens: number;
  outputTokens: number;
  retries: number;
  fallback: boolean;
  estimatedUsd: number;
  estimatedJpy: number | "FX_RATE_REQUIRED";
  quotaRuns: number;
  notes: string[];
};

function jpyFromUsd(usd: number): number | "FX_RATE_REQUIRED" {
  const raw = process.env.ATLAS_USD_JPY_RATE;
  if (!raw) return "FX_RATE_REQUIRED";
  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate <= 0) return "FX_RATE_REQUIRED";
  return Math.round(usd * rate);
}

export function estimateVisionFixtureCost(input: {
  name: string;
  detail: VisionDetailLevel;
  imageCount: number;
  outputTokens?: number;
  retries?: number;
  fallback?: boolean;
}): VisionCostFixtureEstimate {
  const policy = resolveTaskPolicy("vision_analyze");
  const imageTokens = estimateImageInputTokens(input.detail, input.imageCount);
  const promptTokens = 400 * input.imageCount;
  const inputTokens = imageTokens + promptTokens;
  const outputTokens = input.outputTokens ?? 800 * input.imageCount;
  const retries = input.retries ?? 0;
  const aiCalls = input.imageCount + retries;
  const estimatedUsd = estimateVisionCostUsd({ inputTokens, outputTokens });
  const catalogUsd = estimateTokenCostUsd({
    model: policy.model,
    inputTokens,
    outputTokens,
  });

  return {
    name: input.name,
    model: policy.model,
    imageDetail: input.detail,
    imageCount: input.imageCount,
    aiCalls,
    inputTokens,
    imageTokens,
    outputTokens,
    retries,
    fallback: input.fallback ?? false,
    estimatedUsd: catalogUsd,
    estimatedJpy: jpyFromUsd(estimatedUsd),
    quotaRuns: aiCalls,
    notes: [
      VISION_IMAGE_TOKEN_PRICE_NOTE,
      `catalog ${MODEL_CATALOG.strong.model} in $${MODEL_CATALOG.strong.inputPricePerMillion}/M out $${MODEL_CATALOG.strong.outputPricePerMillion}/M`,
      `imageTokens are estimateImageInputTokens(${input.detail}) fallback, not provider usage`,
    ],
  };
}

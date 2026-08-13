import "server-only";

import { estimateTokenCostUsd } from "@/lib/ai/model-catalog";
import { resolveTaskPolicy } from "@/lib/ai/policy-engine";
import { recordUserAiUsage } from "@/lib/billing/usage/meter";
import type { VisionCostRecord, VisionDetailLevel } from "@/lib/vision/types";

export function estimateVisionCostUsd(input: {
  inputTokens: number;
  outputTokens: number;
}): number {
  const policy = resolveTaskPolicy("vision_analyze");
  return estimateTokenCostUsd({
    model: policy.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
  });
}

/** Rough image token estimate when API usage is missing (detail-aware). */
export function estimateImageInputTokens(detail: VisionDetailLevel, imageCount: number): number {
  const per =
    detail === "high" ? 1100 : detail === "low" ? 250 : 700;
  return per * Math.max(1, imageCount);
}

type MemoryCostLedger = VisionCostRecord[];

function costLedger(): MemoryCostLedger {
  const g = globalThis as typeof globalThis & {
    __atlasVisionCostLedger?: MemoryCostLedger;
  };
  if (!g.__atlasVisionCostLedger) g.__atlasVisionCostLedger = [];
  return g.__atlasVisionCostLedger;
}

/** In-memory cost ledger only — never writes local filesystem. */
export async function appendVisionCostRecord(
  record: VisionCostRecord,
): Promise<void> {
  const ledger = costLedger();
  ledger.push(record);
  if (ledger.length > 2000) {
    ledger.splice(0, ledger.length - 2000);
  }
}

export function recordVisionBillingUsage(input: {
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  cached: boolean;
}): void {
  if (input.cached) return;
  try {
    recordUserAiUsage({
      userId: input.userId,
      api: "other",
      feature: "vision_analyze",
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      estimatedCostUsd: input.estimatedCostUsd,
      aiTaskType: "vision_analyze",
    });
  } catch (error) {
    console.error("[vision] Failed to record billing usage");
    void error;
  }
}

export type VisionUsageMeter = {
  userId: string;
  monthKey: string;
  analyzeCount: number;
  imageCount: number;
  estimatedCostUsd: number;
};

export async function getVisionUsageMeter(userId: string): Promise<VisionUsageMeter> {
  const monthKey = new Date().toISOString().slice(0, 7);
  let analyzeCount = 0;
  let imageCount = 0;
  let estimatedCostUsd = 0;
  for (const row of costLedger()) {
    if (row.userId !== userId) continue;
    if (!row.createdAt.startsWith(monthKey)) continue;
    if (!row.success) continue;
    analyzeCount += 1;
    imageCount += row.imageCount;
    estimatedCostUsd += row.estimatedCostUsd;
  }
  return { userId, monthKey, analyzeCount, imageCount, estimatedCostUsd };
}

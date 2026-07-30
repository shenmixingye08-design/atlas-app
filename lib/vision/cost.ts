import "server-only";

import { promises as fs } from "fs";
import path from "path";

import { decisionToModelPolicy, resolveTaskPolicy } from "@/lib/ai/policy-engine";
import { recordUserAiUsage } from "@/lib/billing/usage/meter";
import { bumpPersistenceCounter } from "@/lib/persistence/call-counters";
import { allowProcessCwdDataDir } from "@/lib/runtime/ephemeral-fs";
import type { VisionCostRecord, VisionDetailLevel } from "@/lib/vision/types";

const COST_ROOT = path.join(process.cwd(), ".data", "vision-cost");

export function estimateVisionCostUsd(input: {
  inputTokens: number;
  outputTokens: number;
}): number {
  const policy = decisionToModelPolicy(resolveTaskPolicy("vision_analyze"));
  return (
    (input.inputTokens / 1_000_000) * policy.inputPricePerMillion +
    (input.outputTokens / 1_000_000) * policy.outputPricePerMillion
  );
}

/** Rough image token estimate when API usage is missing (detail-aware). */
export function estimateImageInputTokens(detail: VisionDetailLevel, imageCount: number): number {
  const per =
    detail === "high" ? 1100 : detail === "low" ? 250 : 700;
  return per * Math.max(1, imageCount);
}

export async function appendVisionCostRecord(
  record: VisionCostRecord,
): Promise<void> {
  // Cost ledger is optional analytics — never write under /var/task on Vercel.
  if (!allowProcessCwdDataDir()) {
    bumpPersistenceCounter("processCwdDataDirBlocked");
    return;
  }
  bumpPersistenceCounter("processCwdDataDirAttempts");
  const dir = path.join(COST_ROOT, record.userId);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${record.createdAt.slice(0, 7)}.jsonl`);
  await fs.appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
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
  const file = path.join(COST_ROOT, userId, `${monthKey}.jsonl`);
  let analyzeCount = 0;
  let imageCount = 0;
  let estimatedCostUsd = 0;
  try {
    const raw = await fs.readFile(file, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as VisionCostRecord;
        if (!row.success) continue;
        analyzeCount += 1;
        imageCount += row.imageCount;
        estimatedCostUsd += row.estimatedCostUsd;
      } catch {
        // ignore
      }
    }
  } catch {
    // missing file
  }
  return { userId, monthKey, analyzeCount, imageCount, estimatedCostUsd };
}

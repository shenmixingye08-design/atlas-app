import type { AutomationExecutionMode } from "./execution-mode";
import { recordApiUsage } from "@/lib/owner/api-usage/store";

export type CostRunRecord = {
  timestamp: string;
  executionMode: AutomationExecutionMode;
  estimatedCostUsd: number;
  baselineCostUsd: number;
  fromCache: boolean;
  cacheHits: number;
};

function getBucket(): CostRunRecord[] {
  const globalScope = globalThis as typeof globalThis & {
    __atlasCostSavingsStore?: CostRunRecord[];
  };
  if (!globalScope.__atlasCostSavingsStore) {
    globalScope.__atlasCostSavingsStore = [];
  }
  return globalScope.__atlasCostSavingsStore;
}

const BASELINE_MULTIPLIER: Record<AutomationExecutionMode, number> = {
  eco: 1,
  standard: 1,
  high_quality: 0.85,
};

export function recordCostRun(input: {
  executionMode: AutomationExecutionMode;
  estimatedCostUsd: number;
  fromCache: boolean;
  cacheHits?: number;
}): void {
  const actual = input.fromCache ? 0 : input.estimatedCostUsd;
  const baseline =
    input.executionMode === "eco"
      ? Math.max(actual, input.estimatedCostUsd || 0.001) * 1.7
      : (input.estimatedCostUsd || 0.001) / BASELINE_MULTIPLIER[input.executionMode];

  getBucket().push({
    timestamp: new Date().toISOString(),
    executionMode: input.executionMode,
    estimatedCostUsd: actual,
    baselineCostUsd: baseline,
    fromCache: input.fromCache,
    cacheHits: input.cacheHits ?? (input.fromCache ? 1 : 0),
  });

  if (actual > 0) {
    recordApiUsage({
      providerId: "openai",
      amountUsd: actual,
      source: "automation",
    });
  }
}

export type MonthlyCostSavingsSummary = {
  month: string;
  baselineCostUsd: number;
  actualCostUsd: number;
  reductionPercent: number;
  ecoRunCount: number;
  cacheHitCount: number;
};

export function getMonthlyCostSavingsSummary(
  now: Date = new Date(),
): MonthlyCostSavingsSummary {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthPrefix = month;

  const records = getBucket().filter((record) =>
    record.timestamp.startsWith(monthPrefix),
  );

  const baselineCostUsd = records.reduce(
    (sum, record) => sum + record.baselineCostUsd,
    0,
  );
  const actualCostUsd = records.reduce(
    (sum, record) => sum + record.estimatedCostUsd,
    0,
  );

  const reductionPercent =
    baselineCostUsd > 0
      ? Math.round(((baselineCostUsd - actualCostUsd) / baselineCostUsd) * 100)
      : 0;

  return {
    month,
    baselineCostUsd,
    actualCostUsd,
    reductionPercent: Math.max(0, Math.min(100, reductionPercent)),
    ecoRunCount: records.filter((record) => record.executionMode === "eco").length,
    cacheHitCount: records.reduce((sum, record) => sum + record.cacheHits, 0),
  };
}

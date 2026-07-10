import type { PopularityFeatureId } from "@/lib/owner/popularity-ranking/types";

/** Cost ranking uses the same product features as popularity ranking. */
export type CostFeatureId = PopularityFeatureId;

export type CostFeatureDefinition = {
  id: CostFeatureId;
  label: string;
};

export type CostUsageEventSource = "orchestration" | "automation";

export type CostUsageEvent = {
  featureId: CostFeatureId;
  userId: string | null;
  costUsd: number;
  durationMs: number;
  timestamp: string;
  source: CostUsageEventSource;
};

export type CostWarningLevel = "none" | "approaching" | "critical";

export type CostFeatureMetrics = {
  featureId: CostFeatureId;
  label: string;
  apiCostUsd: number;
  avgUsageTimeMs: number;
  profitMarginPercent: number | null;
  /** Share of total platform API cost (percentage points). */
  costRatioPercent: number | null;
  warningLevel: CostWarningLevel;
  usageCount: number;
  rank: number;
  isEstimated: boolean;
};

export type CostRankingSnapshot = {
  period: {
    month: string;
    monthLabel: string;
  };
  rankings: readonly CostFeatureMetrics[];
  totalApiCostUsd: number;
  generatedAt: string;
};

import type { CostFeatureId } from "./types";

/** Baseline monthly API cost (USD) when no live telemetry exists yet. */
export const ESTIMATED_MONTHLY_COST_USD: Record<CostFeatureId, number> = {
  sns: 85,
  blog: 62,
  sales_material: 48,
  email: 55,
  google: 12,
  dropbox: 6,
  video: 95,
  image: 38,
};

/** Typical average run duration per feature (milliseconds). */
export const ESTIMATED_AVG_DURATION_MS: Record<CostFeatureId, number> = {
  sns: 45_000,
  blog: 120_000,
  sales_material: 90_000,
  email: 75_000,
  google: 8_000,
  dropbox: 6_000,
  video: 180_000,
  image: 60_000,
};

/** Estimated profit margin per feature for mock display. */
export const ESTIMATED_PROFIT_MARGIN_PERCENT: Record<CostFeatureId, number> = {
  sns: 72,
  blog: 68,
  sales_material: 61,
  email: 70,
  google: 88,
  dropbox: 92,
  video: 42,
  image: 55,
};

export function buildEstimatedFeatureCostMetrics(
  featureId: CostFeatureId,
  now: Date = new Date(),
): {
  apiCostUsd: number;
  avgUsageTimeMs: number;
  profitMarginPercent: number;
  costRatioPercent: number;
  usageCount: number;
} {
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  const fullMonthCost = ESTIMATED_MONTHLY_COST_USD[featureId];
  const apiCostUsd =
    Math.round(fullMonthCost * (dayOfMonth / daysInMonth) * 100) / 100;
  const totalEstimatedCost = Object.values(ESTIMATED_MONTHLY_COST_USD).reduce(
    (sum, value) => sum + value * (dayOfMonth / daysInMonth),
    0,
  );
  const costRatioPercent =
    totalEstimatedCost > 0
      ? Math.round((apiCostUsd / totalEstimatedCost) * 100)
      : 0;

  return {
    apiCostUsd,
    avgUsageTimeMs: ESTIMATED_AVG_DURATION_MS[featureId],
    profitMarginPercent: ESTIMATED_PROFIT_MARGIN_PERCENT[featureId],
    costRatioPercent,
    usageCount: Math.max(1, Math.round(apiCostUsd / 0.02)),
  };
}

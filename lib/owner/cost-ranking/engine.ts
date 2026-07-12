import "server-only";

import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";

import { formatOwnerMonthKey, formatOwnerMonthLabel } from "../format";
import { COST_FEATURE_IDS, getCostFeatureDefinition } from "./registry";
import { listCostUsageEvents } from "./store";
import type {
  CostFeatureId,
  CostFeatureMetrics,
  CostRankingSnapshot,
  CostUsageEvent,
  CostWarningLevel,
} from "./types";

const usdJpyRate = (): number => {
  const rate = Number(process.env.ATLAS_USD_JPY_RATE ?? "");
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
};

const HIGH_COST_RATIO_THRESHOLD = 25;
const APPROACHING_COST_RATIO_THRESHOLD = 18;
const LOW_MARGIN_CRITICAL = 5;
const LOW_MARGIN_APPROACHING = 15;

function resolveRevenuePerUsageUsd(totalUsage: number): number {
  if (totalUsage <= 0) return 0;

  try {
    const billing = getOwnerBillingMetrics();
    const rate = usdJpyRate();
    if (billing.mrrJpy <= 0 || rate <= 0) return 0;
    const mrrUsd = billing.mrrJpy / rate;
    return mrrUsd / totalUsage;
  } catch {
    return 0;
  }
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function filterEventsByMonth(
  events: readonly CostUsageEvent[],
  monthKey: string,
): CostUsageEvent[] {
  return events.filter((event) => event.timestamp.startsWith(monthKey));
}

function aggregateFeatureCost(
  featureId: CostFeatureId,
  events: readonly CostUsageEvent[],
): { apiCostUsd: number; totalDurationMs: number; usageCount: number } {
  const featureEvents = events.filter((event) => event.featureId === featureId);
  const apiCostUsd = roundUsd(
    featureEvents.reduce((sum, event) => sum + event.costUsd, 0),
  );
  const totalDurationMs = featureEvents.reduce(
    (sum, event) => sum + event.durationMs,
    0,
  );

  return {
    apiCostUsd,
    totalDurationMs,
    usageCount: featureEvents.length,
  };
}

function computeProfitMarginPercent(
  apiCostUsd: number,
  usageCount: number,
  revenuePerUsageUsd: number,
): number | null {
  if (usageCount <= 0) return null;

  const attributedRevenueUsd = usageCount * revenuePerUsageUsd;
  if (attributedRevenueUsd <= 0) return null;

  const margin =
    ((attributedRevenueUsd - apiCostUsd) / attributedRevenueUsd) * 100;
  return Math.round(margin);
}

function resolveWarningLevel(
  costRatioPercent: number | null,
  profitMarginPercent: number | null,
): CostWarningLevel {
  if (
    (costRatioPercent ?? 0) >= HIGH_COST_RATIO_THRESHOLD ||
    (profitMarginPercent !== null && profitMarginPercent <= LOW_MARGIN_CRITICAL)
  ) {
    return "critical";
  }

  if (
    (costRatioPercent ?? 0) >= APPROACHING_COST_RATIO_THRESHOLD ||
    (profitMarginPercent !== null &&
      profitMarginPercent <= LOW_MARGIN_APPROACHING)
  ) {
    return "approaching";
  }

  return "none";
}

function buildFeatureMetrics(
  featureId: CostFeatureId,
  currentEvents: readonly CostUsageEvent[],
  totalApiCostUsd: number,
  revenuePerUsageUsd: number,
): CostFeatureMetrics {
  const definition = getCostFeatureDefinition(featureId);

  const aggregated = aggregateFeatureCost(featureId, currentEvents);
  const avgUsageTimeMs =
    aggregated.usageCount > 0
      ? Math.round(aggregated.totalDurationMs / aggregated.usageCount)
      : 0;
  const costRatioPercent =
    totalApiCostUsd > 0
      ? Math.round((aggregated.apiCostUsd / totalApiCostUsd) * 100)
      : null;
  const profitMarginPercent = computeProfitMarginPercent(
    aggregated.apiCostUsd,
    aggregated.usageCount,
    revenuePerUsageUsd,
  );

  return {
    featureId,
    label: definition.label,
    apiCostUsd: aggregated.apiCostUsd,
    avgUsageTimeMs,
    profitMarginPercent,
    costRatioPercent,
    warningLevel: resolveWarningLevel(costRatioPercent, profitMarginPercent),
    usageCount: aggregated.usageCount,
    rank: 0,
    isEstimated: false,
  };
}

export function buildCostRankingSnapshot(
  now: Date = new Date(),
): CostRankingSnapshot {
  const monthKey = formatOwnerMonthKey(now);
  const events = listCostUsageEvents();
  const currentEvents = filterEventsByMonth(events, monthKey);

  const totalApiCostUsd = roundUsd(
    currentEvents.reduce((sum, event) => sum + event.costUsd, 0),
  );

  const totalUsage = currentEvents.length;

  const revenuePerUsageUsd = resolveRevenuePerUsageUsd(totalUsage);

  const metrics = COST_FEATURE_IDS.map((featureId) =>
    buildFeatureMetrics(
      featureId,
      currentEvents,
      totalApiCostUsd,
      revenuePerUsageUsd,
    ),
  );

  const sorted = [...metrics].sort((a, b) => b.apiCostUsd - a.apiCostUsd);
  const rankings = sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));

  return {
    period: {
      month: monthKey,
      monthLabel: formatOwnerMonthLabel(now),
    },
    rankings,
    totalApiCostUsd,
    generatedAt: now.toISOString(),
  };
}

import type { PopularityFeatureId } from "./types";

/** Baseline monthly usage when no live telemetry exists yet. */
export const ESTIMATED_MONTHLY_USAGE: Record<PopularityFeatureId, number> = {
  sns: 420,
  blog: 310,
  sales_material: 185,
  email: 260,
  google: 96,
  dropbox: 54,
  video: 38,
  image: 72,
};

/** Estimated active users as a ratio of usage (for mock display). */
export const ESTIMATED_USER_RATIO = 0.28;

/** Previous month multiplier for mock MoM comparison. */
export const ESTIMATED_PREVIOUS_MONTH_RATIO = 0.88;

export function buildEstimatedFeatureMetrics(
  featureId: PopularityFeatureId,
  now: Date = new Date(),
): { activeUsers: number; usageCount: number; previousUsageCount: number } {
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  const fullMonthUsage = ESTIMATED_MONTHLY_USAGE[featureId];
  const usageCount = Math.round(fullMonthUsage * (dayOfMonth / daysInMonth));
  const previousUsageCount = Math.round(
    fullMonthUsage * ESTIMATED_PREVIOUS_MONTH_RATIO,
  );
  const activeUsers = Math.max(
    1,
    Math.round(usageCount * ESTIMATED_USER_RATIO),
  );

  return { activeUsers, usageCount, previousUsageCount };
}

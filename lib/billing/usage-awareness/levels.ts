import type { UsageWarningLevel } from "./types";

export const USAGE_NOTICE_REMAINING_RATE = 0.3;
export const USAGE_WARNING_REMAINING_RATE = 0.15;
export const USAGE_CRITICAL_REMAINING_RATE = 0.05;

export function isUnlimitedLimit(limit: number): boolean {
  return !Number.isFinite(limit) || limit === Number.POSITIVE_INFINITY;
}

/**
 * remaining = limit - used (clamped at 0 for exhausted).
 * Unlimited / non-offered (limit <= 0) never warn.
 */
export function resolveUsageWarningLevel(input: {
  used: number;
  limit: number;
}): UsageWarningLevel {
  if (isUnlimitedLimit(input.limit) || input.limit <= 0) {
    return "normal";
  }

  const remaining = Math.max(0, input.limit - input.used);
  const remainingRate = remaining / input.limit;

  if (remaining <= 0) return "exhausted";
  if (remaining <= 1 || remainingRate <= USAGE_CRITICAL_REMAINING_RATE) {
    return "critical";
  }
  if (remainingRate <= USAGE_WARNING_REMAINING_RATE) return "warning";
  if (remainingRate <= USAGE_NOTICE_REMAINING_RATE) return "notice";
  return "normal";
}

export function usageRates(input: {
  used: number;
  limit: number;
}): { remaining: number; usageRate: number | null; remainingRate: number | null } {
  if (isUnlimitedLimit(input.limit)) {
    return { remaining: Number.POSITIVE_INFINITY, usageRate: null, remainingRate: null };
  }
  if (input.limit <= 0) {
    return { remaining: 0, usageRate: null, remainingRate: null };
  }
  const remaining = Math.max(0, input.limit - input.used);
  return {
    remaining,
    usageRate: input.used / input.limit,
    remainingRate: remaining / input.limit,
  };
}

const LEVEL_RANK: Record<UsageWarningLevel, number> = {
  normal: 0,
  notice: 1,
  warning: 2,
  critical: 3,
  exhausted: 4,
};

export function usageLevelRank(level: UsageWarningLevel): number {
  return LEVEL_RANK[level];
}

export function isUsageAlertLevel(level: UsageWarningLevel): boolean {
  return level !== "normal";
}

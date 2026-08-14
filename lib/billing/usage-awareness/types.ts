import type { PlanId } from "@/lib/billing/plans/types";

/** Meters that actually exist on UsageLimitSummary. Do not invent others. */
export const USAGE_METER_IDS = [
  "aiRuns",
  "snsPosts",
  "xUrlPosts",
  "wordpressPosts",
  "automationTasks",
] as const;

export type UsageMeterId = (typeof USAGE_METER_IDS)[number];

export type UsageWarningLevel =
  | "normal"
  | "notice"
  | "warning"
  | "critical"
  | "exhausted";

export type UsageUpgradeCandidate = {
  planId: PlanId;
  planName: string;
  monthlyPriceJpy: number;
  nextLimit: number;
};

export type UsageItemView = {
  id: UsageMeterId;
  planId: PlanId;
  used: number;
  limit: number;
  remaining: number;
  usageRate: number | null;
  remainingRate: number | null;
  resetAt: string;
  resetLabel: string;
  level: UsageWarningLevel;
  offered: boolean;
  unlimited: boolean;
  unit: "times" | "posts" | "tasks";
  primaryUpgrade: UsageUpgradeCandidate | null;
  secondaryUpgrade: UsageUpgradeCandidate | null;
};

export type UsageAwarenessView = {
  planId: PlanId;
  subscribedPlanId: PlanId;
  month: string;
  resetAt: string;
  resetLabel: string;
  items: UsageItemView[];
  /** Highest-severity offered meter (for banners). */
  headline: UsageItemView | null;
  periodRightsDiffer: boolean;
  inconsistencies: readonly string[];
};

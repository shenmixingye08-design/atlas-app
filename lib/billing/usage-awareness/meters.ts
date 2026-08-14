import type { PlanLimits } from "@/lib/billing/plans/types";

import type { UsageMeterId } from "./types";

/** Plan Registry field for each real usage meter. */
export const USAGE_LIMIT_KEY = {
  aiRuns: "aiUsageMonthly",
  snsPosts: "xAutoPostsMonthly",
  xUrlPosts: "xUrlPostsMonthly",
  wordpressPosts: "wordpressPostsMonthly",
  automationTasks: "automationTasks",
} as const satisfies Record<UsageMeterId, keyof PlanLimits>;

export const USAGE_METER_UNIT = {
  aiRuns: "times",
  snsPosts: "posts",
  xUrlPosts: "posts",
  wordpressPosts: "posts",
  automationTasks: "tasks",
} as const satisfies Record<UsageMeterId, "times" | "posts" | "tasks">;

export function registryLimitForMeter(
  limits: PlanLimits,
  meterId: UsageMeterId,
): number {
  const value = limits[USAGE_LIMIT_KEY[meterId]];
  return typeof value === "number" ? value : 0;
}

import "server-only";

import { getPlanDefinition } from "../plans/registry";
import { resolveEffectivePlanId } from "../policy";

import { getUserAiUsageBreakdown } from "./meter";
import {
  getUsageMonthKey,
  getUsageSnapshot,
} from "./store";
import type { UsageLimitSummary, UsageMeter } from "./types";

function remaining(used: number, limit: number): number {
  return Math.max(0, limit - used);
}

function meter(used: number, limit: number): UsageMeter {
  return {
    used,
    limit,
    remaining: remaining(used, limit),
  };
}

export function getUserUsageLimitSummary(userId: string): UsageLimitSummary {
  const plan = getPlanDefinition(resolveEffectivePlanId(userId));
  const month = getUsageMonthKey();
  const usage = getUsageSnapshot(userId, month);
  const aiDetail = getUserAiUsageBreakdown(userId);

  return {
    planId: plan.planId,
    month,
    aiRuns: meter(usage.aiRuns, plan.limits.aiUsageMonthly),
    snsPosts: meter(usage.snsPosts, plan.limits.xAutoPostsMonthly),
    xUrlPosts: meter(usage.xUrlPosts ?? 0, plan.limits.xUrlPostsMonthly),
    wordpressPosts: meter(
      usage.wordpressPosts ?? 0,
      plan.limits.wordpressPostsMonthly,
    ),
    automationTasks: meter(
      usage.automationTasksActive,
      plan.limits.automationTasks,
    ),
    aiDetail,
  };
}

export {
  getUsageSnapshot,
  incrementUsageCounter,
  incrementUsageCounterOnce,
  setAutomationTaskCount,
} from "./store";
export { getUsageMonthKey } from "./store";
export {
  getUserAiUsageBreakdown,
  recordUserAiUsage,
  recordUserAiUsageFromTexts,
} from "./meter";
export { tweetContainsExternalUrl } from "./x-url";

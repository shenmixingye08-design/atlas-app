import "server-only";

import { getPlanDefinition } from "../plans/registry";
import { resolveUserSubscription } from "../subscriptions/service";

import { getUserAiUsageBreakdown } from "./meter";
import {
  getUsageMonthKey,
  getUsageSnapshot,
} from "./store";
import type { UsageLimitSummary } from "./types";

function remaining(used: number, limit: number): number {
  return Math.max(0, limit - used);
}

export function getUserUsageLimitSummary(userId: string): UsageLimitSummary {
  const subscription = resolveUserSubscription(userId);
  const plan = getPlanDefinition(subscription.planId);
  const month = getUsageMonthKey();
  const usage = getUsageSnapshot(userId, month);
  const aiDetail = getUserAiUsageBreakdown(userId);

  return {
    planId: subscription.planId,
    month,
    aiRuns: {
      used: usage.aiRuns,
      limit: plan.limits.aiUsageMonthly,
      remaining: remaining(usage.aiRuns, plan.limits.aiUsageMonthly),
    },
    snsPosts: {
      used: usage.snsPosts,
      limit: plan.limits.snsPostsMonthly,
      remaining: remaining(usage.snsPosts, plan.limits.snsPostsMonthly),
    },
    automationTasks: {
      used: usage.automationTasksActive,
      limit: plan.limits.automationTasks,
      remaining: remaining(
        usage.automationTasksActive,
        plan.limits.automationTasks,
      ),
    },
    aiDetail,
  };
}

export {
  getUsageSnapshot,
  incrementUsageCounter,
  setAutomationTaskCount,
} from "./store";
export { getUsageMonthKey } from "./store";
export {
  getUserAiUsageBreakdown,
  recordUserAiUsage,
  recordUserAiUsageFromTexts,
} from "./meter";

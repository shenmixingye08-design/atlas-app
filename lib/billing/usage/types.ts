import type { PlanId } from "../plans/types";

export type UsageMonthKey = string;

export type UsageCounters = {
  aiRuns: number;
  snsPosts: number;
  automationTasksActive: number;
};

export type UsageSnapshot = UsageCounters & {
  userId: string;
  month: UsageMonthKey;
  updatedAt: string;
};

export type UsageLimitSummary = {
  planId: PlanId;
  month: UsageMonthKey;
  aiRuns: { used: number; limit: number; remaining: number };
  snsPosts: { used: number; limit: number; remaining: number };
  automationTasks: { used: number; limit: number; remaining: number };
};

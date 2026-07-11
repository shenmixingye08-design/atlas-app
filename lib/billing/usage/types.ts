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

/** User-facing AI surfaces that consume plan AI quota. */
export type AiUsageApi =
  | "responses"
  | "orchestrate"
  | "commander"
  | "automation"
  | "google_drive"
  | "google_gmail"
  | "google_calendar"
  | "dropbox"
  | "sales_material"
  | "other";

export type AiUsageEvent = {
  id: string;
  userId: string;
  planId: PlanId;
  timestamp: string;
  model: string;
  api: AiUsageApi;
  feature: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type AiUsagePeriodSummary = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type AiUsageBreakdown = {
  today: AiUsagePeriodSummary;
  month: AiUsagePeriodSummary;
  allTime: AiUsagePeriodSummary;
  byModel: Record<string, AiUsagePeriodSummary>;
  byFeature: Record<string, AiUsagePeriodSummary>;
};

export type UsageLimitSummary = {
  planId: PlanId;
  month: UsageMonthKey;
  aiRuns: { used: number; limit: number; remaining: number };
  snsPosts: { used: number; limit: number; remaining: number };
  automationTasks: { used: number; limit: number; remaining: number };
  aiDetail: AiUsageBreakdown;
};

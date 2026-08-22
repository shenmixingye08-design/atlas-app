import type { PlanId } from "../plans/types";

export type UsageMonthKey = string;

export type UsageCounters = {
  aiRuns: number;
  /** X auto-posts this month (total, including URL posts). */
  snsPosts: number;
  /** X posts this month that contained an external URL. */
  xUrlPosts: number;
  /** WordPress publish operations this month (drafts excluded). */
  wordpressPosts: number;
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

export type MonthlyAiAggregate = {
  userId: string;
  month: UsageMonthKey;
  model: string;
  feature: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  updatedAt: string;
};

export type AiUsageBreakdown = {
  today: AiUsagePeriodSummary;
  month: AiUsagePeriodSummary;
  allTime: AiUsagePeriodSummary;
  byModel: Record<string, AiUsagePeriodSummary>;
  byFeature: Record<string, AiUsagePeriodSummary>;
};

export type UsageMeter = {
  used: number;
  limit: number;
  remaining: number;
};

export type UsageLimitSummary = {
  planId: PlanId;
  month: UsageMonthKey;
  aiRuns: UsageMeter;
  snsPosts: UsageMeter;
  xUrlPosts: UsageMeter;
  wordpressPosts: UsageMeter;
  automationTasks: UsageMeter;
  aiDetail: AiUsageBreakdown;
  /** False when durable usage could not be loaded. Never treat used=0 as real. */
  ready?: boolean;
};

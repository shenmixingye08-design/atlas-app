import type { OwnerBillingMetrics } from "../billing/analytics/types";
import type { PlanId } from "../billing/plans/types";

/** ISO 8601 month key, e.g. 2026-07 */
export type OwnerMonthKey = string;

export type OwnerCurrencyMetric = {
  amountUsd: number;
  label: string;
  /** Where the value comes from today — wired to live APIs later. */
  source: OwnerDataSourceId;
  isEstimated: boolean;
};

export type OwnerDataSourceId =
  | "stripe"
  | "openai"
  | "server"
  | "external_api"
  | "eco_mode"
  | "analytics"
  | "mock";

export type OwnerDataSourceStatus = {
  id: OwnerDataSourceId;
  label: string;
  connected: boolean;
  note: string;
};

export type OwnerUserCounts = {
  paid: number;
  free: number;
  churned: number;
};

export type OwnerPopularFeature = {
  featureId: string;
  featureName: string;
  activeUsers: number;
  usageCount: number;
  trend: "up" | "flat" | "down";
};

export type OwnerHighCostUser = {
  userId: string;
  displayName: string;
  plan: PlanId;
  estimatedCostUsd: number;
  runCount: number;
};

export type OwnerStripePayout = {
  scheduledAt: string;
  amountUsd: number;
  status: "scheduled" | "pending" | "paid";
  source: OwnerDataSourceId;
};

/** Full owner dashboard snapshot — provider-agnostic aggregate. */
export type OwnerDashboardSnapshot = {
  period: {
    month: OwnerMonthKey;
    label: string;
  };
  revenue: OwnerCurrencyMetric;
  apiCost: OwnerCurrencyMetric;
  serverCost: OwnerCurrencyMetric;
  estimatedProfit: OwnerCurrencyMetric;
  users: OwnerUserCounts;
  popularFeatures: readonly OwnerPopularFeature[];
  ecoModeReductionPercent: number;
  ecoModeRuns: number;
  highCostUsers: readonly OwnerHighCostUser[];
  nextStripePayout: OwnerStripePayout;
  billing: OwnerBillingMetrics;
  dataSources: readonly OwnerDataSourceStatus[];
  generatedAt: string;
};

import type { OwnerBillingMetrics } from "../billing/analytics/types";
import type { PlanId } from "../billing/plans/types";

/** ISO 8601 month key, e.g. 2026-07 */
export type OwnerMonthKey = string;

export type OwnerMetricAvailability =
  | "ok"
  | "disconnected"
  | "unset"
  | "empty"
  | "failed";

export type OwnerStripeMode = "live" | "test";

export type OwnerDataSourceId =
  | "stripe"
  | "openai"
  | "server"
  | "external_api"
  | "eco_mode"
  | "analytics"
  | "subscriptions"
  | "webhook_log"
  | "ai_usage";

export type OwnerCurrencyMetric = {
  /** Present only when availability === "ok" (including legitimate zero). */
  amountUsd: number | null;
  amountJpy: number | null;
  label: string;
  source: OwnerDataSourceId;
  availability: OwnerMetricAvailability;
  /** Always false — estimated / demo values are not allowed. */
  isEstimated: false;
  periodLabel: string;
  dataSourceLabel: string;
  lastUpdatedAt: string | null;
  stripeMode: OwnerStripeMode | null;
  statusMessage: string | null;
  /** True when the latest fetch failed; lastUpdatedAt may still show prior success. */
  updateFailed: boolean;
};

export type OwnerProfitMetric = {
  label: string;
  availability: OwnerMetricAvailability | "incomplete";
  /** Definite profit when every required cost input is available. */
  amountUsd: number | null;
  amountJpy: number | null;
  /** Partial (revenue − known costs) when some costs are missing. */
  provisionalDeltaUsd: number | null;
  provisionalDeltaJpy: number | null;
  statusMessage: string | null;
  periodLabel: string;
  dataSourceLabel: string;
  lastUpdatedAt: string | null;
  stripeMode: OwnerStripeMode | null;
  updateFailed: boolean;
  isEstimated: false;
};

export type OwnerCountMetric = {
  label: string;
  value: number | null;
  availability: OwnerMetricAvailability;
  periodLabel: string;
  dataSourceLabel: string;
  lastUpdatedAt: string | null;
  stripeMode: OwnerStripeMode | null;
  statusMessage: string | null;
};

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
  cancelScheduled: number;
  paymentFailures: number;
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
  scheduledAt: string | null;
  amountUsd: number | null;
  amountJpy: number | null;
  status: "scheduled" | "pending" | "paid" | "unknown" | "unavailable";
  source: OwnerDataSourceId;
  availability: OwnerMetricAvailability;
  statusMessage: string | null;
  stripeMode: OwnerStripeMode | null;
  lastUpdatedAt: string | null;
};

export type OwnerAiUsageSummary = {
  availability: OwnerMetricAvailability;
  statusMessage: string | null;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  recordedCostUsd: number;
  pricingTableVersion: string;
  pricingTableUpdatedAt: string;
  lastUpdatedAt: string | null;
};

export type OwnerRunCounts = {
  availability: OwnerMetricAvailability;
  statusMessage: string | null;
  aiRequests: number;
  automationRuns: number;
  commanderRuns: number;
  lastUpdatedAt: string | null;
  dataSourceLabel: string;
};

export type OwnerWebhookSummary = {
  successRatePercent: number | null;
  lastSyncedAt: string | null;
  totalCount: number;
  failureCount: number;
  availability: OwnerMetricAvailability;
  statusMessage: string | null;
};

/** Full owner dashboard snapshot — real data only (no demo / estimate fillers). */
export type OwnerDashboardSnapshot = {
  /** Always "live" — mock provider no longer exists as a data source. */
  metricsProvider: "live";
  period: {
    month: OwnerMonthKey;
    label: string;
  };
  stripeMode: OwnerStripeMode | null;
  revenue: OwnerCurrencyMetric;
  refunds: OwnerCurrencyMetric;
  stripeFees: OwnerCurrencyMetric;
  netRevenue: OwnerCurrencyMetric;
  apiCost: OwnerCurrencyMetric;
  serverCost: OwnerCurrencyMetric;
  externalCost: OwnerCurrencyMetric;
  profit: OwnerProfitMetric;
  /** @deprecated Use profit — kept for transitional UI wiring. */
  estimatedProfit: OwnerProfitMetric;
  users: OwnerUserCounts;
  userMetrics: {
    paid: OwnerCountMetric;
    cancelScheduled: OwnerCountMetric;
    paymentFailures: OwnerCountMetric;
  };
  aiUsage: OwnerAiUsageSummary;
  runCounts: OwnerRunCounts;
  webhook: OwnerWebhookSummary;
  popularFeatures: readonly OwnerPopularFeature[];
  popularFeaturesAvailability: OwnerMetricAvailability;
  ecoModeReductionPercent: number | null;
  ecoModeRuns: number;
  ecoModeAvailability: OwnerMetricAvailability;
  highCostUsers: readonly OwnerHighCostUser[];
  highCostUsersAvailability: OwnerMetricAvailability;
  nextStripePayout: OwnerStripePayout;
  billing: OwnerBillingMetrics;
  dataSources: readonly OwnerDataSourceStatus[];
  generatedAt: string;
};

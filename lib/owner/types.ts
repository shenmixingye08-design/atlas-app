import type { OwnerBillingMetrics } from "../billing/analytics/types";
import type { PlanId } from "../billing/plans/types";

/** ISO 8601 month key, e.g. 2026-07 */
export type OwnerMonthKey = string;

export type OwnerMetricAvailability =
  | "ok"
  | "disconnected"
  | "unset"
  | "empty"
  | "failed"
  | "unavailable"
  | "incomplete"
  | "stale";

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
  /** Prior successful amount — never presented as the current value. */
  lastKnownAmountUsd: number | null;
  lastKnownAmountJpy: number | null;
  lastKnownAt: string | null;
  label: string;
  source: OwnerDataSourceId;
  availability: OwnerMetricAvailability;
  /** Always false — estimated / demo values are not allowed. */
  isEstimated: false;
  /** True when amounts are last-known-good, not the current fetch. */
  isLastKnownGood: boolean;
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
  availability: OwnerMetricAvailability;
  /** Definite profit when every required cost input is available. */
  amountUsd: number | null;
  amountJpy: number | null;
  lastKnownAmountUsd: number | null;
  lastKnownAmountJpy: number | null;
  lastKnownAt: string | null;
  isLastKnownGood: boolean;
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
  lastKnownValue: number | null;
  lastKnownAt: string | null;
  isLastKnownGood: boolean;
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
  /** Registered MINERVOT users. Null when the registry cannot be read. */
  total: number | null;
  paid: number | null;
  free: number | null;
  churned: number | null;
  cancelScheduled: number | null;
  paymentFailures: number | null;
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
  failureCount: number | null;
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
    total: OwnerCountMetric;
    paid: OwnerCountMetric;
    free: OwnerCountMetric;
    cancelScheduled: OwnerCountMetric;
    paymentFailures: OwnerCountMetric;
  };
  /** Screen render time — never treat as a data-source sync time. */
  screenRefreshedAt: string;
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

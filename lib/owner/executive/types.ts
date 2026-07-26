import type { OwnerMetricAvailability } from "@/lib/owner/types";
import type { PlanId } from "@/lib/billing/plans/types";
import type { JobStatus } from "@/lib/jobs/types";
import type { AnalyticsPeriod, AnalyticsSeriesPoint } from "@/lib/owner/monitoring/types";

export type ExecutivePeriod = AnalyticsPeriod | "year";

export type ExecutiveKpiCard = {
  id: string;
  label: string;
  value: string;
  availability: OwnerMetricAvailability | "incomplete";
  statusMessage: string | null;
  hint: string | null;
  accent: "default" | "revenue" | "cost" | "profit";
};

export type AiModelCostRow = {
  model: string;
  displayName: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  apiHints: readonly string[];
};

export type DeliverableCostRow = {
  featureId: string;
  label: string;
  generationCount: number;
  avgCostUsd: number | null;
  avgDurationMs: number | null;
  successRatePercent: number | null;
  failureRatePercent: number | null;
  totalCostUsd: number;
};

export type UserProfitRow = {
  userId: string;
  displayName: string;
  planId: PlanId;
  revenueJpy: number | null;
  apiCostUsd: number;
  profitJpy: number | null;
  runCount: number;
  avgDurationMs: number | null;
  avgDeliverables: number | null;
  status: "active" | "suspended" | "churned" | "free";
};

export type DepartmentMonitorStatus = "running" | "idle" | "error";

export type DepartmentMonitorRow = {
  id: string;
  label: string;
  status: DepartmentMonitorStatus;
  statusLabel: string;
  processedCount: number;
  avgDurationMs: number | null;
  queueCount: number;
  errorCount: number;
};

export type JobMonitorRow = {
  id: string;
  userId: string;
  jobType: string;
  status: JobStatus;
  currentStep: string | null;
  progressPercent: number;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type JobMonitorBuckets = {
  running: readonly JobMonitorRow[];
  queued: readonly JobMonitorRow[];
  failed: readonly JobMonitorRow[];
  completed: readonly JobMonitorRow[];
  counts: {
    running: number;
    queued: number;
    failed: number;
    completed: number;
  };
};

export type ApiCostLogModelLine = {
  model: string;
  displayName: string;
  costUsd: number;
  requests: number;
};

export type ApiCostLogRow = {
  featureId: string;
  label: string;
  models: readonly ApiCostLogModelLine[];
  totalCostUsd: number;
  generationCount: number;
};

export type StripeExecutiveMetrics = {
  availability: OwnerMetricAvailability;
  statusMessage: string | null;
  todayRevenueJpy: number | null;
  monthRevenueJpy: number | null;
  cumulativeRevenueJpy: number | null;
  mrrJpy: number | null;
  arrJpy: number | null;
  subscriptionCount: number | null;
  renewalRatePercent: number | null;
  churnRatePercent: number | null;
  ltvJpy: number | null;
  arpuJpy: number | null;
};

export type SystemMonitorMetric = {
  id: string;
  label: string;
  value: string;
  availability: OwnerMetricAvailability;
  statusMessage: string | null;
};

export type DeliverableAnalyticsRow = {
  featureId: string;
  label: string;
  generationCount: number;
  avgRating: number | null;
  avgDurationMs: number | null;
  regenRatePercent: number | null;
  successRatePercent: number | null;
};

export type ExecutiveDashboardSnapshot = {
  generatedAt: string;
  period: ExecutivePeriod;
  kpis: readonly ExecutiveKpiCard[];
  aiByModel: readonly AiModelCostRow[];
  deliverableCosts: readonly DeliverableCostRow[];
  userProfits: readonly UserProfitRow[];
  departments: readonly DepartmentMonitorRow[];
  jobs: JobMonitorBuckets;
  stripe: StripeExecutiveMetrics;
  system: readonly SystemMonitorMetric[];
  deliverableAnalytics: readonly DeliverableAnalyticsRow[];
  apiCostLog: readonly ApiCostLogRow[];
  series: readonly AnalyticsSeriesPoint[];
  ownerEmails: readonly string[];
};

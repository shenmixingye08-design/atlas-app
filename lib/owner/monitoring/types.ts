/** Owner monitoring + analytics (aggregates existing Owner modules). */

export type MonitorTargetId =
  | "openai"
  | "stripe"
  | "clerk"
  | "supabase"
  | "google"
  | "dropbox"
  | "line"
  | "cron"
  | "commander"
  | "automation"
  | "notifications"
  | "billing";

/** 正常 / 警告 / 停止 */
export type MonitorHealthLevel = "ok" | "warn" | "down";

export type AnalyticsPeriod = "today" | "week" | "month";

export type MonitorTargetSnapshot = {
  id: MonitorTargetId;
  label: string;
  level: MonitorHealthLevel;
  detail: string;
  lastCheckedAt: string | null;
};

export type AnalyticsKpis = {
  period: AnalyticsPeriod;
  activeUsers: number;
  totalUsers: number;
  activeRatePercent: number;
  aiRuns: number;
  automationRuns: number;
  commanderRuns: number;
  notificationCount: number;
  stripeRevenueJpy: number;
  openAiCostJpy: number;
  profitForecastJpy: number;
  apiErrorRatePercent: number;
  avgResponseMs: number;
  isEstimated: boolean;
};

export type AnalyticsSeriesPoint = {
  key: string;
  label: string;
  aiRuns: number;
  automationRuns: number;
  commanderRuns: number;
  errors: number;
  revenueJpy: number;
  openAiCostJpy: number;
};

export type MonitoringIncident = {
  id: string;
  at: string;
  kind: string;
  targetId: MonitorTargetId | "api";
  message: string;
  notified: boolean;
};

export type MonitoringSnapshot = {
  health: readonly MonitorTargetSnapshot[];
  okCount: number;
  warnCount: number;
  downCount: number;
  analytics: {
    today: AnalyticsKpis;
    week: AnalyticsKpis;
    month: AnalyticsKpis;
  };
  series: {
    daily: readonly AnalyticsSeriesPoint[];
    weekly: readonly AnalyticsSeriesPoint[];
    monthly: readonly AnalyticsSeriesPoint[];
  };
  incidents: readonly MonitoringIncident[];
  generatedAt: string;
};

export type RecordIncidentInput = {
  kind:
    | "openai_failure"
    | "stripe_failure"
    | "google_failure"
    | "cron_stopped"
    | "commander_failure"
    | "automation_failure"
    | "api_500"
    | string;
  targetId: MonitorTargetId | "api";
  message: string;
  userId?: string | null;
  critical?: boolean;
  source?: string;
};

import "server-only";

import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";
import { listAuditLogEntries } from "@/lib/owner/audit-log";
import type { AuditLogEntry } from "@/lib/owner/audit-log/types";
import { listApiUsageRecords } from "@/lib/owner/api-usage/store";
import { listAiUsageEvents } from "@/lib/billing/usage/store";
import { getCostRankingSnapshot } from "@/lib/owner/cost-ranking";
import { listOwnerNotifications } from "@/lib/notifications";
import { listUserSubscriptions } from "@/lib/billing/subscriptions/store";
import { buildLiveProfitScenario } from "@/lib/owner/profit-simulator/defaults";
import { listErrorCategoryStates } from "@/lib/owner/error-monitoring/store";

import type {
  AnalyticsKpis,
  AnalyticsPeriod,
  AnalyticsSeriesPoint,
} from "./types";

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function periodStart(period: AnalyticsPeriod, now: Date): Date {
  const start = startOfUtcDay(now);
  if (period === "today") return start;
  if (period === "week") {
    start.setUTCDate(start.getUTCDate() - 6);
    return start;
  }
  start.setUTCDate(1);
  return start;
}

function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function countActions(
  entries: AuditLogEntry[],
  actions: readonly string[],
  from: Date,
  to: Date,
  result?: "success" | "failure",
): number {
  return entries.filter((row) => {
    if (!actions.includes(row.action)) return false;
    if (result && row.result !== result) return false;
    return inRange(row.at, from, to);
  }).length;
}

function uniqueUsers(
  entries: AuditLogEntry[],
  from: Date,
  to: Date,
): number {
  const set = new Set<string>();
  for (const row of entries) {
    if (!row.userId) continue;
    if (!inRange(row.at, from, to)) continue;
    set.add(row.userId);
  }
  return set.size;
}

function openAiCostUsd(from: Date, to: Date): number {
  const fromApiUsage = listApiUsageRecords()
    .filter(
      (row) =>
        row.providerId === "openai" && inRange(row.timestamp, from, to),
    )
    .reduce((sum, row) => sum + row.amountUsd, 0);
  if (fromApiUsage > 0) return fromApiUsage;

  return listAiUsageEvents()
    .filter((row) => inRange(row.timestamp, from, to))
    .reduce((sum, row) => sum + row.estimatedCostUsd, 0);
}

function notificationCount(from: Date, to: Date): number {
  return listOwnerNotifications().filter((n) =>
    inRange(n.createdAt, from, to),
  ).length;
}

function errorRatePercent(
  entries: AuditLogEntry[],
  from: Date,
  to: Date,
): number {
  const window = entries.filter((row) => inRange(row.at, from, to));
  if (window.length === 0) {
    const open = listErrorCategoryStates().reduce(
      (sum, s) => sum + (s.resolutionStatus === "open" ? s.occurrenceCount : 0),
      0,
    );
    return open > 0 ? Math.min(100, open * 5) : 0;
  }
  const failures = window.filter((row) => row.result === "failure").length;
  return Math.round((failures / window.length) * 1000) / 10;
}

export function buildAnalyticsKpis(
  period: AnalyticsPeriod,
  now: Date = new Date(),
): AnalyticsKpis {
  const from = periodStart(period, now);
  const entries = listAuditLogEntries();
  const billing = getOwnerBillingMetrics();
  const totalUsers =
    listUserSubscriptions().length ||
    billing.paidSubscribers + billing.freeSubscribers;
  const activeUsers = uniqueUsers(entries, from, now) || 0;
  const activeRatePercent =
    totalUsers > 0
      ? Math.round((activeUsers / totalUsers) * 1000) / 10
      : 0;

  const aiRuns =
    countActions(entries, ["request_create", "commander_run"], from, now) ||
    countActions(entries, ["automation_run"], from, now);
  const automationRuns = countActions(
    entries,
    ["automation_run", "automation_create"],
    from,
    now,
  );
  const commanderRuns = countActions(entries, ["commander_run"], from, now);

  const costSnap = getCostRankingSnapshot(now);
  const avgResponseMs = Math.round(
    costSnap.rankings.reduce((sum, f) => sum + (f.avgUsageTimeMs ?? 0), 0) /
      Math.max(1, costSnap.rankings.length),
  );

  const profit = buildLiveProfitScenario(now);
  const openAiCostUsdRaw = openAiCostUsd(from, now);
  const usdJpyRate = Number(process.env.ATLAS_USD_JPY_RATE ?? "");
  const openAiCostJpy =
    openAiCostUsdRaw <= 0
      ? 0
      : Number.isFinite(usdJpyRate) && usdJpyRate > 0
        ? Math.round(openAiCostUsdRaw * usdJpyRate)
        : 0;
  const stripeRevenueJpy =
    period === "month"
      ? billing.mrrJpy
      : period === "week"
        ? Math.round(billing.mrrJpy / 4)
        : Math.round(billing.mrrJpy / 30);

  const hasLive =
    entries.length > 0 ||
    listApiUsageRecords().length > 0 ||
    listUserSubscriptions().length > 0;

  return {
    period,
    activeUsers,
    totalUsers,
    activeRatePercent: hasLive ? activeRatePercent : 0,
    aiRuns,
    automationRuns,
    commanderRuns,
    notificationCount: notificationCount(from, now),
    stripeRevenueJpy,
    openAiCostJpy,
    profitForecastJpy: profit.result.endOfMonthProfitForecastJpy,
    apiErrorRatePercent: errorRatePercent(entries, from, now),
    avgResponseMs: avgResponseMs > 0 ? avgResponseMs : 0,
    isEstimated: false,
  };
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildBucketSeries(
  keys: string[],
  labelFor: (key: string) => string,
  now: Date,
): AnalyticsSeriesPoint[] {
  const entries = listAuditLogEntries();
  const usage = listApiUsageRecords();
  const billing = getOwnerBillingMetrics();
  const dayRevenue = Math.round(billing.mrrJpy / 30);

  return keys.map((key) => {
    const from = new Date(`${key}T00:00:00.000Z`);
    const to = new Date(`${key}T23:59:59.999Z`);
    // For week/month keys that aren't day ISO, treat as prefix match
    const match = (iso: string) =>
      key.length === 10
        ? inRange(iso, from, to)
        : iso.startsWith(key);

    const scoped = entries.filter((row) => match(row.at));
    const aiRuns = scoped.filter((r) =>
      ["request_create", "commander_run", "automation_run"].includes(r.action),
    ).length;
    const automationRuns = scoped.filter((r) =>
      r.action.startsWith("automation_"),
    ).length;
    const commanderRuns = scoped.filter(
      (r) => r.action === "commander_run",
    ).length;
    const errors = scoped.filter((r) => r.result === "failure").length;
    const usdJpyRate = Number(process.env.ATLAS_USD_JPY_RATE ?? "");
    const openAiCostUsd = usage
      .filter((r) => r.providerId === "openai" && match(r.timestamp))
      .reduce((s, r) => s + r.amountUsd, 0);
    const openAiCostJpy =
      openAiCostUsd <= 0
        ? 0
        : Number.isFinite(usdJpyRate) && usdJpyRate > 0
          ? Math.round(openAiCostUsd * usdJpyRate)
          : 0;

    return {
      key,
      label: labelFor(key),
      aiRuns,
      automationRuns,
      commanderRuns,
      errors,
      revenueJpy: dayRevenue,
      openAiCostJpy,
    };
  });
}

export function buildAnalyticsSeries(now: Date = new Date()): {
  daily: AnalyticsSeriesPoint[];
  weekly: AnalyticsSeriesPoint[];
  monthly: AnalyticsSeriesPoint[];
} {
  const dailyKeys: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = startOfUtcDay(now);
    d.setUTCDate(d.getUTCDate() - i);
    dailyKeys.push(dayKey(d));
  }

  const weeklyKeys: string[] = [];
  for (let i = 3; i >= 0; i -= 1) {
    const d = startOfUtcDay(now);
    d.setUTCDate(d.getUTCDate() - i * 7);
    // ISO week-ish label by Monday
    const monday = new Date(d);
    const day = monday.getUTCDay();
    const diff = (day + 6) % 7;
    monday.setUTCDate(monday.getUTCDate() - diff);
    weeklyKeys.push(dayKey(monday));
  }

  const monthlyKeys: string[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    monthlyKeys.push(d.toISOString().slice(0, 7));
  }

  return {
    daily: buildBucketSeries(dailyKeys, (k) => k.slice(5), now),
    weekly: buildBucketSeries(weeklyKeys, (k) => `W ${k.slice(5)}`, now),
    monthly: buildBucketSeries(monthlyKeys, (k) => k, now),
  };
}

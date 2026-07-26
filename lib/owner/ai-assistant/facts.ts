import "server-only";

import { createHash } from "node:crypto";

import { summarizeAiUsageEvents } from "@/lib/billing/usage/meter";
import { listAiUsageEvents } from "@/lib/billing/usage/store";
import { getPlanDefinition, listPlanDefinitions } from "@/lib/billing/plans/registry";
import type { PlanId } from "@/lib/billing/plans/types";
import { listUserSubscriptions } from "@/lib/billing/subscriptions/store";
import { isPaidCapableStatus } from "@/lib/billing/subscriptions/service";
import { getCancellationAnalysisSnapshot } from "@/lib/owner/cancellation-analysis";
import { getCostRankingSnapshot } from "@/lib/owner/cost-ranking";
import { getExecutiveDashboardSnapshot } from "@/lib/owner/executive";
import { getMonitoringSnapshot } from "@/lib/owner/monitoring";
import { getPopularityRankingSnapshot } from "@/lib/owner/popularity-ranking/service";
import { buildLiveProfitScenario } from "@/lib/owner/profit-simulator/defaults";
import { listErrorCategoryStates } from "@/lib/owner/error-monitoring/store";

import type { AssistantPeriod } from "./types";

export type PeriodMetrics = {
  apiCostUsd: number;
  visionRequests: number;
  visionCostUsd: number;
  imageGenCostUsd: number;
  imageGenRequests: number;
  totalRequests: number;
  inputTokens: number;
  outputTokens: number;
  avgOutputTokens: number;
  errorRatePercent: number;
  revenueJpy: number | null;
  activeUsers: number;
  generationCount: number;
};

export type AssistantFacts = {
  period: AssistantPeriod;
  nowIso: string;
  current: PeriodMetrics;
  previous: PeriodMetrics;
  mrrJpy: number;
  arrJpy: number;
  paidUsers: number;
  freeUsers: number;
  churnRatePercent: number | null;
  arpuJpy: number | null;
  ltvJpy: number | null;
  marginPercent: number | null;
  profitJpy: number | null;
  hqUsageSharePercent: number | null;
  topDeliverable: { id: string; label: string; usageCount: number } | null;
  highestMarginDeliverable: {
    id: string;
    label: string;
    marginPercent: number | null;
    avgCostUsd: number | null;
  } | null;
  risingCostDeliverable: {
    id: string;
    label: string;
    avgCostUsd: number;
  } | null;
  planBreakdown: readonly {
    planId: PlanId;
    planName: string;
    priceJpy: number;
    subscribers: number;
    aiCostUsd: number;
    aiRuns: number;
  }[];
  qualityRows: readonly {
    featureId: string;
    label: string;
    usageCount: number;
    avgDurationMs: number;
    avgCostUsd: number | null;
    failureRatePercent: number | null;
  }[];
  growthRateMonthly: number | null;
  userGrowthRateMonthly: number | null;
  usdJpyRate: number | null;
  dataNotes: string[];
};

function getUsdJpyRateOrNull(): number | null {
  const rate = Number(process.env.ATLAS_USD_JPY_RATE ?? "");
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return rate;
}

function windowFor(
  period: AssistantPeriod,
  now: Date,
  offset = 0,
): { start: Date; end: Date } {
  const end = new Date(now);
  const start = new Date(now);

  if (period === "day") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    start.setDate(start.getDate() - offset);
    end.setDate(end.getDate() - offset);
    return { start, end };
  }

  if (period === "week") {
    end.setHours(23, 59, 59, 999);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6 - offset * 7);
    end.setDate(end.getDate() - offset * 7);
    return { start, end };
  }

  // month
  const year = now.getFullYear();
  const month = now.getMonth() - offset;
  const startMonth = new Date(year, month, 1, 0, 0, 0, 0);
  const endMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start: startMonth, end: endMonth };
}

function inRange(iso: string, start: Date, end: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function isVisionModel(model: string, feature: string, api: string): boolean {
  const hay = `${model} ${feature} ${api}`.toLowerCase();
  return /vision|gpt-4o|receipt|image_input/.test(hay);
}

function isImageGenModel(model: string, feature: string): boolean {
  const hay = `${model} ${feature}`.toLowerCase();
  return /dall|image.?gen|gpt-image|image_generation|\bimage\b/.test(hay);
}

function metricsForWindow(
  start: Date,
  end: Date,
  errorRatePercent: number,
  revenueJpy: number | null,
  activeUsers: number,
): PeriodMetrics {
  const events = listAiUsageEvents().filter((e) =>
    inRange(e.timestamp, start, end),
  );

  let apiCostUsd = 0;
  let visionRequests = 0;
  let visionCostUsd = 0;
  let imageGenCostUsd = 0;
  let imageGenRequests = 0;
  let totalRequests = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const event of events) {
    apiCostUsd += event.estimatedCostUsd;
    totalRequests += event.requestCount;
    inputTokens += event.inputTokens;
    outputTokens += event.outputTokens;
    if (isVisionModel(event.model, event.feature, event.api)) {
      visionRequests += event.requestCount;
      visionCostUsd += event.estimatedCostUsd;
    }
    if (isImageGenModel(event.model, event.feature)) {
      imageGenRequests += event.requestCount;
      imageGenCostUsd += event.estimatedCostUsd;
    }
  }

  return {
    apiCostUsd: Math.round(apiCostUsd * 100) / 100,
    visionRequests,
    visionCostUsd: Math.round(visionCostUsd * 100) / 100,
    imageGenCostUsd: Math.round(imageGenCostUsd * 100) / 100,
    imageGenRequests,
    totalRequests,
    inputTokens,
    outputTokens,
    avgOutputTokens:
      totalRequests > 0 ? Math.round(outputTokens / totalRequests) : 0,
    errorRatePercent,
    revenueJpy,
    activeUsers,
    generationCount: totalRequests,
  };
}

export async function buildAssistantFacts(
  period: AssistantPeriod,
  now: Date = new Date(),
): Promise<AssistantFacts> {
  const dataNotes: string[] = [];
  const executive = await getExecutiveDashboardSnapshot(
    period === "day" ? "today" : period === "week" ? "week" : "month",
    now,
  );
  const monitoring = await getMonitoringSnapshot(now);
  const cancel = getCancellationAnalysisSnapshot(now);
  const cost = getCostRankingSnapshot(now);
  const popularity = getPopularityRankingSnapshot(now);
  const liveProfit = buildLiveProfitScenario(now);
  const usdJpyRate = getUsdJpyRateOrNull();
  if (usdJpyRate == null) {
    dataNotes.push("ATLAS_USD_JPY_RATE 未設定のため一部利益計算は未確定");
  }

  const currentWindow = windowFor(period, now, 0);
  const previousWindow = windowFor(period, now, 1);

  const analytics =
    period === "day"
      ? monitoring.analytics.today
      : period === "week"
        ? monitoring.analytics.week
        : monitoring.analytics.month;

  const openErrors = listErrorCategoryStates().reduce(
    (sum, row) =>
      sum + (row.resolutionStatus === "open" ? row.occurrenceCount : 0),
    0,
  );
  const errorRate =
    analytics.apiErrorRatePercent > 0
      ? analytics.apiErrorRatePercent
      : openErrors > 0
        ? Math.min(100, openErrors * 5)
        : 0;

  const stripe = executive.stripe;
  const revenueCurrent =
    period === "day"
      ? stripe.todayRevenueJpy
      : period === "week"
        ? stripe.monthRevenueJpy == null
          ? null
          : Math.round(stripe.monthRevenueJpy / 4)
        : stripe.monthRevenueJpy;

  if (period === "week" && stripe.monthRevenueJpy != null) {
    dataNotes.push("週次売上は月次現金売上の按分（週次現金バケット未接続）");
  }

  const current = metricsForWindow(
    currentWindow.start,
    currentWindow.end,
    errorRate,
    revenueCurrent,
    analytics.activeUsers,
  );
  const previous = metricsForWindow(
    previousWindow.start,
    previousWindow.end,
    errorRate,
    null,
    0,
  );

  const aiAll = summarizeAiUsageEvents(listAiUsageEvents(), now);
  const hqLike = Object.entries(aiAll.byModel)
    .filter(([model]) => /gpt-5\.5|gpt-5(?!-mini)|o3|o1/i.test(model))
    .reduce((sum, [, row]) => sum + row.requests, 0);
  const hqUsageSharePercent =
    aiAll.month.requests > 0
      ? Math.round((hqLike / aiAll.month.requests) * 1000) / 10
      : null;

  const topDeliverable =
    popularity.rankings.find((row) => row.usageCount > 0) != null
      ? {
          id: popularity.rankings[0]!.featureId,
          label: popularity.rankings[0]!.label,
          usageCount: popularity.rankings[0]!.usageCount,
        }
      : null;

  const rankedCosts = [...cost.rankings].sort(
    (a, b) => (b.profitMarginPercent ?? -999) - (a.profitMarginPercent ?? -999),
  );
  const highestMarginDeliverable =
    rankedCosts.find((row) => row.usageCount > 0) != null
      ? {
          id: rankedCosts[0]!.featureId,
          label: rankedCosts[0]!.label,
          marginPercent: rankedCosts[0]!.profitMarginPercent,
          avgCostUsd:
            rankedCosts[0]!.usageCount > 0
              ? Math.round(
                  (rankedCosts[0]!.apiCostUsd / rankedCosts[0]!.usageCount) *
                    100,
                ) / 100
              : null,
        }
      : null;

  const rising = [...cost.rankings]
    .filter((row) => row.usageCount > 0)
    .sort((a, b) => b.apiCostUsd - a.apiCostUsd)[0];
  const risingCostDeliverable = rising
    ? {
        id: rising.featureId,
        label: rising.label,
        avgCostUsd:
          rising.usageCount > 0
            ? Math.round((rising.apiCostUsd / rising.usageCount) * 100) / 100
            : rising.apiCostUsd,
      }
    : null;

  const subs = listUserSubscriptions();
  const planIds = listPlanDefinitions().map((p) => p.planId);
  const planBreakdown = planIds.map((planId) => {
    const def = getPlanDefinition(planId);
    const subscribers = subs.filter(
      (s) => s.planId === planId && isPaidCapableStatus(s.status),
    ).length;
    const freeCount =
      planId === "free"
        ? subs.filter((s) => s.planId === "free").length
        : subscribers;
    const events = listAiUsageEvents().filter((e) => e.planId === planId);
    return {
      planId,
      planName: def.name,
      priceJpy: def.monthlyPriceJpy,
      subscribers: planId === "free" ? freeCount : subscribers,
      aiCostUsd:
        Math.round(
          events.reduce((sum, e) => sum + e.estimatedCostUsd, 0) * 100,
        ) / 100,
      aiRuns: events.reduce((sum, e) => sum + e.requestCount, 0),
    };
  });

  const qualityRows = cost.rankings.map((row) => ({
    featureId: row.featureId,
    label: row.label,
    usageCount: row.usageCount,
    avgDurationMs: row.avgUsageTimeMs,
    avgCostUsd:
      row.usageCount > 0
        ? Math.round((row.apiCostUsd / row.usageCount) * 100) / 100
        : null,
    failureRatePercent: null as number | null,
  }));

  // Monthly growth from series if enough points with revenue
  const monthly = monitoring.series.monthly;
  let growthRateMonthly: number | null = null;
  if (monthly.length >= 2) {
    const last = monthly[monthly.length - 1]!;
    const prev = monthly[monthly.length - 2]!;
    if (prev.revenueJpy > 0) {
      growthRateMonthly =
        Math.round(((last.revenueJpy - prev.revenueJpy) / prev.revenueJpy) * 1000) /
        10;
    }
  }

  const paid = stripe.subscriptionCount ?? liveProfit.result.paidSubscribers;
  const free =
    planBreakdown.find((p) => p.planId === "free")?.subscribers ?? 0;

  const mrrJpy = stripe.mrrJpy ?? liveProfit.result.mrrJpy;
  const arpuJpy = stripe.arpuJpy;
  const churnRatePercent = stripe.churnRatePercent ?? cancel.churnRatePercent;
  const ltvJpy = stripe.ltvJpy;

  let marginPercent: number | null = null;
  let profitJpy: number | null = null;
  if (
    current.revenueJpy != null &&
    usdJpyRate != null &&
    current.apiCostUsd >= 0
  ) {
    profitJpy = Math.round(current.revenueJpy - current.apiCostUsd * usdJpyRate);
    marginPercent =
      current.revenueJpy > 0
        ? Math.round((profitJpy / current.revenueJpy) * 1000) / 10
        : null;
  } else if (liveProfit.result.revenueJpy > 0) {
    marginPercent = liveProfit.result.profitMarginPercent;
    profitJpy = liveProfit.result.profitJpy;
    dataNotes.push("利益率は利益シミュレーター実績ベースを使用");
  }

  const userGrowthRateMonthly =
    monthly.length >= 2 && monthly[monthly.length - 2]!.aiRuns > 0
      ? Math.round(
          ((monthly[monthly.length - 1]!.aiRuns -
            monthly[monthly.length - 2]!.aiRuns) /
            monthly[monthly.length - 2]!.aiRuns) *
            1000,
        ) / 10
      : null;

  return {
    period,
    nowIso: now.toISOString(),
    current,
    previous,
    mrrJpy,
    arrJpy: mrrJpy * 12,
    paidUsers: paid,
    freeUsers: free,
    churnRatePercent,
    arpuJpy,
    ltvJpy,
    marginPercent,
    profitJpy,
    hqUsageSharePercent,
    topDeliverable,
    highestMarginDeliverable,
    risingCostDeliverable,
    planBreakdown,
    qualityRows,
    growthRateMonthly,
    userGrowthRateMonthly,
    usdJpyRate,
    dataNotes,
  };
}

export function hashAssistantFacts(facts: AssistantFacts): string {
  const payload = JSON.stringify({
    period: facts.period,
    current: facts.current,
    previous: {
      apiCostUsd: facts.previous.apiCostUsd,
      visionRequests: facts.previous.visionRequests,
      imageGenCostUsd: facts.previous.imageGenCostUsd,
      avgOutputTokens: facts.previous.avgOutputTokens,
    },
    mrrJpy: facts.mrrJpy,
    marginPercent: facts.marginPercent,
    paidUsers: facts.paidUsers,
    churnRatePercent: facts.churnRatePercent,
    topDeliverable: facts.topDeliverable,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

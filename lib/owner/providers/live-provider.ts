import "server-only";

import {
  summarizeAiUsageEvents,
} from "@/lib/billing/usage/meter";
import { listAiUsageEvents } from "@/lib/billing/usage/store";
import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";
import { fetchStripeLiveMonthMetrics } from "@/lib/billing/analytics/stripe-live-metrics";
import {
  MODEL_PRICING_TABLE_UPDATED_AT,
  MODEL_PRICING_TABLE_VERSION,
} from "@/lib/ai/model-catalog";
import { getMonthlyCostSavingsSummary } from "@/lib/cost-optimization/cost-savings-tracker";
import { listAuditLogEntries } from "@/lib/owner/audit-log";
import { buildStripeWebhookMonitoringSnapshot } from "@/lib/owner/billing-webhook/telemetry";
import { listPopularityUsageEvents } from "@/lib/owner/popularity-ranking/store";
import { buildPopularityRankingSnapshot } from "@/lib/owner/popularity-ranking/engine";
import {
  formatOwnerMonthKey,
  formatOwnerMonthLabel,
} from "../format";
import type {
  OwnerCountMetric,
  OwnerCurrencyMetric,
  OwnerDashboardSnapshot,
  OwnerMetricAvailability,
  OwnerProfitMetric,
  OwnerStripeMode,
} from "../types";
import type { OwnerMetricsProvider } from "./types";

function modeLabel(mode: OwnerStripeMode | null): string {
  if (mode === "live") return "Stripe本番";
  if (mode === "test") return "Stripeテスト";
  return "Stripe";
}

function moneyMetric(input: {
  label: string;
  amount: number | null;
  currency: string;
  availability: OwnerMetricAvailability;
  source: OwnerCurrencyMetric["source"];
  periodLabel: string;
  dataSourceLabel: string;
  lastUpdatedAt: string | null;
  stripeMode: OwnerStripeMode | null;
  statusMessage: string | null;
  updateFailed?: boolean;
}): OwnerCurrencyMetric {
  const isJpy = input.currency.toLowerCase() === "jpy";
  const amount = input.availability === "ok" ? input.amount : null;
  return {
    label: input.label,
    amountUsd: amount === null ? null : isJpy ? null : amount,
    amountJpy: amount === null ? null : isJpy ? Math.round(amount) : null,
    source: input.source,
    availability: input.availability,
    isEstimated: false,
    periodLabel: input.periodLabel,
    dataSourceLabel: input.dataSourceLabel,
    lastUpdatedAt: input.lastUpdatedAt,
    stripeMode: input.stripeMode,
    statusMessage: input.statusMessage,
    updateFailed: input.updateFailed ?? false,
  };
}

function countMetric(input: {
  label: string;
  value: number;
  availability?: OwnerMetricAvailability;
  periodLabel: string;
  dataSourceLabel: string;
  lastUpdatedAt: string | null;
  stripeMode: OwnerStripeMode | null;
  statusMessage?: string | null;
}): OwnerCountMetric {
  return {
    label: input.label,
    value: input.value,
    availability: input.availability ?? "ok",
    periodLabel: input.periodLabel,
    dataSourceLabel: input.dataSourceLabel,
    lastUpdatedAt: input.lastUpdatedAt,
    stripeMode: input.stripeMode,
    statusMessage: input.statusMessage ?? null,
  };
}

function maskUserId(userId: string): string {
  if (userId.length <= 8) return `${userId.slice(0, 2)}***`;
  return `${userId.slice(0, 6)}…${userId.slice(-4)}`;
}

function buildProfit(input: {
  periodLabel: string;
  stripeMode: OwnerStripeMode | null;
  lastUpdatedAt: string | null;
  netRevenueUsd: number | null;
  netRevenueJpy: number | null;
  currency: string;
  apiCostUsd: number | null;
  stripeFeesMajor: number | null;
  refundsMajor: number | null;
  serverCostUsd: number | null;
  externalCostUsd: number | null;
  netAlreadySubtractsFeesAndRefunds: boolean;
}): OwnerProfitMetric {
  const missing: string[] = [];
  if (input.netRevenueUsd === null && input.netRevenueJpy === null) {
    missing.push("純売上");
  }
  if (input.apiCostUsd === null) missing.push("OpenAI原価");
  if (input.serverCostUsd === null) missing.push("インフラ費用");
  if (input.externalCostUsd === null) missing.push("その他費用");

  // Fees/refunds already in net when coming from Stripe live netRevenue.
  if (!input.netAlreadySubtractsFeesAndRefunds) {
    if (input.stripeFeesMajor === null) missing.push("Stripe手数料");
    if (input.refundsMajor === null) missing.push("返金");
  }

  const isJpy = input.currency.toLowerCase() === "jpy";
  const netMajor =
    (isJpy ? input.netRevenueJpy : input.netRevenueUsd) ?? null;
  const apiMajor = input.apiCostUsd; // USD ledger — convert only for display later
  const knownCostsUsd =
    (input.apiCostUsd ?? 0) +
    (input.serverCostUsd ?? 0) +
    (input.externalCostUsd ?? 0) +
    (input.netAlreadySubtractsFeesAndRefunds
      ? 0
      : (input.stripeFeesMajor ?? 0) + (input.refundsMajor ?? 0));

  // Convert JPY net to USD approx only for provisional math when mixed — prefer same currency.
  // ATLAS Stripe is typically JPY; AI cost is USD. Keep provisional in USD when net is USD,
  // otherwise show provisional in JPY using AI cost * FX only if both present — actually
  // user asked not to invent FX for display. Store provisional in the net currency when possible.

  if (missing.length > 0) {
    let provisionalDeltaUsd: number | null = null;
    let provisionalDeltaJpy: number | null = null;

    if (netMajor !== null && input.apiCostUsd !== null) {
      if (isJpy) {
        // Do not invent FX — provisional = net JPY only minus known JPY costs (fees/refunds already in net).
        // OpenAI USD cannot be subtracted without FX → leave provisional as net only note via message.
        provisionalDeltaJpy = Math.round(netMajor);
        provisionalDeltaUsd = null;
      } else {
        provisionalDeltaUsd =
          Math.round((netMajor - knownCostsUsd) * 100) / 100;
      }
    } else if (netMajor !== null) {
      if (isJpy) provisionalDeltaJpy = Math.round(netMajor);
      else provisionalDeltaUsd = netMajor;
    }

    return {
      label: "利益",
      availability: "incomplete",
      amountUsd: null,
      amountJpy: null,
      provisionalDeltaUsd,
      provisionalDeltaJpy,
      statusMessage: "一部費用未取得のため利益未確定",
      periodLabel: input.periodLabel,
      dataSourceLabel: "純売上 − 取得済み費用",
      lastUpdatedAt: input.lastUpdatedAt,
      stripeMode: input.stripeMode,
      updateFailed: false,
      isEstimated: false,
    };
  }

  if (isJpy && netMajor !== null && apiMajor !== null) {
    // Still cannot form definite JPY profit without FX for OpenAI USD — treat as incomplete.
    return {
      label: "利益",
      availability: "incomplete",
      amountUsd: null,
      amountJpy: null,
      provisionalDeltaJpy: Math.round(netMajor),
      provisionalDeltaUsd: null,
      statusMessage:
        "一部費用未取得のため利益未確定（OpenAI原価はUSD・為替未設定）",
      periodLabel: input.periodLabel,
      dataSourceLabel: "純売上 − 取得済み費用",
      lastUpdatedAt: input.lastUpdatedAt,
      stripeMode: input.stripeMode,
      updateFailed: false,
      isEstimated: false,
    };
  }

  const profitUsd =
    netMajor === null || apiMajor === null
      ? null
      : Math.round((netMajor - knownCostsUsd) * 100) / 100;

  return {
    label: "利益",
    availability: "ok",
    amountUsd: profitUsd,
    amountJpy: null,
    provisionalDeltaUsd: null,
    provisionalDeltaJpy: null,
    statusMessage: null,
    periodLabel: input.periodLabel,
    dataSourceLabel: "純売上 − OpenAI − インフラ − その他",
    lastUpdatedAt: input.lastUpdatedAt,
    stripeMode: input.stripeMode,
    updateFailed: false,
    isEstimated: false,
  };
}

export const liveOwnerMetricsProvider: OwnerMetricsProvider = {
  id: "live",

  async getDashboardSnapshot(now = new Date()): Promise<OwnerDashboardSnapshot> {
    const periodLabel = formatOwnerMonthLabel(now);
    const monthKey = formatOwnerMonthKey(now);
    const billing = getOwnerBillingMetrics(now);
    const stripe = await fetchStripeLiveMonthMetrics(now);
    const stripeMode = stripe.mode ?? billing.stripeMode;
    const modeText = modeLabel(stripeMode);
    const periodWithMode = `${modeText}・${periodLabel}`;
    const stripeSourceLabel = `${modeText} API（Invoice / Refund / BalanceTransaction）`;

    const stripeAvailability: OwnerMetricAvailability =
      stripe.availability === "ok"
        ? "ok"
        : stripe.availability === "failed"
          ? "failed"
          : "disconnected";

    const stripeStatus =
      stripeAvailability === "ok"
        ? null
        : stripe.statusMessage ??
          (stripeAvailability === "failed" ? "取得失敗" : "Stripe未接続");

    const revenue = moneyMetric({
      label: "今月売上",
      amount: stripe.grossRevenue,
      currency: stripe.currency,
      availability: stripeAvailability,
      source: "stripe",
      periodLabel: periodWithMode,
      dataSourceLabel: stripeSourceLabel,
      lastUpdatedAt: stripe.fetchedAt,
      stripeMode,
      statusMessage: stripeStatus,
      updateFailed: stripe.updateFailed,
    });

    const refunds = moneyMetric({
      label: "返金額",
      amount: stripe.refunds,
      currency: stripe.currency,
      availability: stripeAvailability,
      source: "stripe",
      periodLabel: periodWithMode,
      dataSourceLabel: stripeSourceLabel,
      lastUpdatedAt: stripe.fetchedAt,
      stripeMode,
      statusMessage: stripeStatus,
      updateFailed: stripe.updateFailed,
    });

    const stripeFees = moneyMetric({
      label: "Stripe手数料",
      amount: stripe.fees,
      currency: stripe.currency,
      availability: stripeAvailability,
      source: "stripe",
      periodLabel: periodWithMode,
      dataSourceLabel: stripeSourceLabel,
      lastUpdatedAt: stripe.fetchedAt,
      stripeMode,
      statusMessage: stripeStatus,
      updateFailed: stripe.updateFailed,
    });

    const netRevenue = moneyMetric({
      label: "純売上",
      amount: stripe.netRevenue,
      currency: stripe.currency,
      availability: stripeAvailability,
      source: "stripe",
      periodLabel: periodWithMode,
      dataSourceLabel: "売上 − 返金 − Stripe手数料",
      lastUpdatedAt: stripe.fetchedAt,
      stripeMode,
      statusMessage: stripeStatus,
      updateFailed: stripe.updateFailed,
    });

    const aiEvents = listAiUsageEvents();
    const aiBreakdown = summarizeAiUsageEvents(aiEvents, now);
    const monthAi = aiBreakdown.month;
    const hasAiData = aiEvents.length > 0;
    const latestAiAt =
      aiEvents.length > 0
        ? aiEvents.reduce(
            (latest, event) =>
              event.timestamp > latest ? event.timestamp : latest,
            aiEvents[0]!.timestamp,
          )
        : null;

    const apiCost: OwnerCurrencyMetric = hasAiData
      ? {
          label: "今月OpenAI原価",
          amountUsd: Math.round(monthAi.estimatedCostUsd * 100) / 100,
          amountJpy: null,
          source: "ai_usage",
          availability: "ok",
          isEstimated: false,
          periodLabel: periodLabel,
          dataSourceLabel: `AI利用台帳 × 料金表 ${MODEL_PRICING_TABLE_VERSION}`,
          lastUpdatedAt: latestAiAt,
          stripeMode: null,
          statusMessage: null,
          updateFailed: false,
        }
      : {
          label: "今月OpenAI原価",
          amountUsd: null,
          amountJpy: null,
          source: "ai_usage",
          availability: "empty",
          isEstimated: false,
          periodLabel: periodLabel,
          dataSourceLabel: "recordUserAiUsage / AI利用台帳",
          lastUpdatedAt: null,
          stripeMode: null,
          statusMessage: "利用データなし",
          updateFailed: false,
        };

    const serverCost: OwnerCurrencyMetric = {
      label: "サーバー費用",
      amountUsd: null,
      amountJpy: null,
      source: "server",
      availability: "unset",
      isEstimated: false,
      periodLabel: periodLabel,
      dataSourceLabel: "Vercel / インフラ Billing API",
      lastUpdatedAt: null,
      stripeMode: null,
      statusMessage: "自動取得不可",
      updateFailed: false,
    };

    const externalCost: OwnerCurrencyMetric = {
      label: "その他外部サービス費用",
      amountUsd: null,
      amountJpy: null,
      source: "external_api",
      availability: "unset",
      isEstimated: false,
      periodLabel: periodLabel,
      dataSourceLabel: "Supabase / Clerk / LINE / Google / Dropbox",
      lastUpdatedAt: null,
      stripeMode: null,
      statusMessage: "自動取得不可",
      updateFailed: false,
    };

    const profit = buildProfit({
      periodLabel: periodWithMode,
      stripeMode,
      lastUpdatedAt: stripe.fetchedAt ?? latestAiAt,
      netRevenueUsd: netRevenue.amountUsd,
      netRevenueJpy: netRevenue.amountJpy,
      currency: stripe.currency,
      apiCostUsd: apiCost.amountUsd,
      stripeFeesMajor: stripeAvailability === "ok" ? stripe.fees : null,
      refundsMajor: stripeAvailability === "ok" ? stripe.refunds : null,
      serverCostUsd: null,
      externalCostUsd: null,
      netAlreadySubtractsFeesAndRefunds: true,
    });

    const webhookSnap = buildStripeWebhookMonitoringSnapshot(now);
    const webhookAvailability: OwnerMetricAvailability =
      webhookSnap.totalCount > 0 ? "ok" : "empty";

    const auditEntries = listAuditLogEntries();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const inMonth = (iso: string) => new Date(iso) >= monthStart;
    const automationRuns = auditEntries.filter(
      (row) =>
        (row.action === "automation_run" || row.action === "automation_create") &&
        inMonth(row.at),
    ).length;
    const commanderRuns = auditEntries.filter(
      (row) => row.action === "commander_run" && inMonth(row.at),
    ).length;
    const aiRequestsFromAudit = auditEntries.filter(
      (row) =>
        (row.action === "request_create" || row.action === "commander_run") &&
        inMonth(row.at),
    ).length;
    const hasRunData =
      auditEntries.length > 0 || (hasAiData && monthAi.requests > 0);

    const popularityEvents = listPopularityUsageEvents();
    const popularFeatures =
      popularityEvents.length === 0
        ? []
        : buildPopularityRankingSnapshot(now)
            .rankings.filter((row) => !row.isEstimated && row.usageCount > 0)
            .slice(0, 8)
            .map((row) => ({
              featureId: row.featureId,
              featureName: row.label,
              activeUsers: row.activeUsers,
              usageCount: row.usageCount,
              trend:
                (row.momChangePercent ?? 0) > 5
                  ? ("up" as const)
                  : (row.momChangePercent ?? 0) < -5
                    ? ("down" as const)
                    : ("flat" as const),
            }));

    const highCostMap = new Map<
      string,
      { plan: (typeof aiEvents)[number]["planId"]; cost: number; runs: number }
    >();
    for (const event of aiEvents) {
      if (!event.timestamp.startsWith(monthKey)) continue;
      const current = highCostMap.get(event.userId) ?? {
        plan: event.planId,
        cost: 0,
        runs: 0,
      };
      current.cost += event.estimatedCostUsd;
      current.runs += event.requestCount;
      highCostMap.set(event.userId, current);
    }
    const highCostUsers = [...highCostMap.entries()]
      .map(([userId, row]) => ({
        userId,
        displayName: maskUserId(userId),
        plan: row.plan,
        estimatedCostUsd: Math.round(row.cost * 100) / 100,
        runCount: row.runs,
      }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
      .slice(0, 10);

    const ecoSummary = getMonthlyCostSavingsSummary(now);
    const hasEco = ecoSummary.ecoRunCount > 0 || ecoSummary.actualCostUsd > 0;

    const generatedAt = now.toISOString();
    const subUpdatedAt =
      listAiUsageEvents().length > 0 ? generatedAt : generatedAt;

    return {
      period: {
        month: monthKey,
        label: periodLabel,
      },
      stripeMode,
      revenue,
      refunds,
      stripeFees,
      netRevenue,
      apiCost,
      serverCost,
      externalCost,
      profit,
      estimatedProfit: profit,
      users: {
        paid: billing.paidSubscribers,
        free: billing.freeSubscribers,
        churned: billing.churnedSubscribers,
        cancelScheduled: billing.cancelScheduledCount,
        paymentFailures: billing.paymentFailureCount,
      },
      userMetrics: {
        paid: countMetric({
          label: "有料契約者数",
          value: billing.paidSubscribers,
          periodLabel: periodLabel,
          dataSourceLabel: "Subscription store（Webhook同期）",
          lastUpdatedAt: subUpdatedAt,
          stripeMode,
        }),
        cancelScheduled: countMetric({
          label: "解約予定数",
          value: billing.cancelScheduledCount,
          periodLabel: periodLabel,
          dataSourceLabel: "cancelAtPeriodEnd",
          lastUpdatedAt: subUpdatedAt,
          stripeMode,
        }),
        paymentFailures: countMetric({
          label: "支払い失敗数（今月）",
          value: billing.paymentFailureCount,
          periodLabel: periodLabel,
          dataSourceLabel: "Billing history",
          lastUpdatedAt: subUpdatedAt,
          stripeMode,
        }),
      },
      aiUsage: {
        availability: hasAiData ? "ok" : "empty",
        statusMessage: hasAiData ? null : "利用データなし",
        requests: monthAi.requests,
        inputTokens: monthAi.inputTokens,
        outputTokens: monthAi.outputTokens,
        totalTokens: monthAi.totalTokens,
        recordedCostUsd: Math.round(monthAi.estimatedCostUsd * 100) / 100,
        pricingTableVersion: MODEL_PRICING_TABLE_VERSION,
        pricingTableUpdatedAt: MODEL_PRICING_TABLE_UPDATED_AT,
        lastUpdatedAt: latestAiAt,
      },
      runCounts: {
        availability: hasRunData ? "ok" : "empty",
        statusMessage: hasRunData ? null : "データなし",
        aiRequests: hasAiData ? monthAi.requests : aiRequestsFromAudit,
        automationRuns,
        commanderRuns,
        lastUpdatedAt: hasRunData ? generatedAt : null,
        dataSourceLabel: "AI利用台帳 / 監査ログ",
      },
      webhook: {
        successRatePercent: webhookSnap.successRatePercent,
        lastSyncedAt: webhookSnap.lastSyncedAt,
        totalCount: webhookSnap.totalCount,
        failureCount: webhookSnap.failureCount,
        availability: webhookAvailability,
        statusMessage:
          webhookAvailability === "empty" ? "データなし" : null,
      },
      popularFeatures,
      popularFeaturesAvailability:
        popularityEvents.length === 0 ? "empty" : "ok",
      ecoModeReductionPercent: hasEco ? ecoSummary.reductionPercent : null,
      ecoModeRuns: ecoSummary.ecoRunCount,
      ecoModeAvailability: hasEco ? "ok" : "empty",
      highCostUsers,
      highCostUsersAvailability: highCostUsers.length > 0 ? "ok" : "empty",
      nextStripePayout: {
        scheduledAt: stripe.upcomingPayoutAt,
        amountUsd:
          stripe.currency.toLowerCase() === "jpy"
            ? null
            : stripe.upcomingPayoutAmount,
        amountJpy:
          stripe.currency.toLowerCase() === "jpy"
            ? stripe.upcomingPayoutAmount === null
              ? null
              : Math.round(stripe.upcomingPayoutAmount)
            : null,
        status: stripe.upcomingPayoutStatus ?? "unavailable",
        source: "stripe",
        availability:
          stripeAvailability !== "ok"
            ? stripeAvailability
            : stripe.upcomingPayoutAmount === null
              ? "empty"
              : "ok",
        statusMessage:
          stripeAvailability !== "ok"
            ? stripeStatus
            : stripe.upcomingPayoutAmount === null
              ? "データなし"
              : null,
        stripeMode,
        lastUpdatedAt: stripe.fetchedAt,
      },
      billing,
      dataSources: [
        {
          id: "stripe",
          label: "Stripe",
          connected: stripe.connected && stripeAvailability === "ok",
          note:
            stripeAvailability === "ok"
              ? `${modeText} · 売上・返金・手数料を取得`
              : stripeStatus ?? "未接続",
        },
        {
          id: "ai_usage",
          label: "OpenAI利用台帳",
          connected: hasAiData,
          note: hasAiData
            ? `料金表 ${MODEL_PRICING_TABLE_VERSION}`
            : "利用データなし",
        },
        {
          id: "subscriptions",
          label: "契約ストア",
          connected: billing.hasSubscriptionRecords,
          note: billing.hasSubscriptionRecords
            ? "Webhook同期の契約数"
            : "データなし",
        },
        {
          id: "webhook_log",
          label: "Stripe Webhookログ",
          connected: webhookSnap.totalCount > 0,
          note:
            webhookSnap.totalCount > 0
              ? `成功率 ${webhookSnap.successRatePercent ?? "—"}%`
              : "データなし",
        },
        {
          id: "server",
          label: "サーバー費用",
          connected: false,
          note: "自動取得不可",
        },
        {
          id: "external_api",
          label: "外部サービス費用",
          connected: false,
          note: "自動取得不可",
        },
        {
          id: "eco_mode",
          label: "エコモード",
          connected: hasEco,
          note: hasEco ? "実行ログから集計" : "データなし",
        },
      ],
      generatedAt,
    };
  },
};

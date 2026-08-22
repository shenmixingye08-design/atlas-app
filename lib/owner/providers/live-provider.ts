import "server-only";

import { listAiUsageEvents } from "@/lib/billing/usage/store";
import { getOwnerBillingMetrics } from "@/lib/billing/analytics/owner-metrics";
import { hydrateSubscriptionsFromSupabase } from "@/lib/billing/subscriptions/store";
import { fetchStripeLiveMonthMetrics } from "@/lib/billing/analytics/stripe-live-metrics";
import { fetchStripeSubscriptionLiveMetrics } from "@/lib/billing/analytics/stripe-subscription-metrics";
import {
  loadOwnerLastKnownGood,
  mergeOwnerLastKnownGood,
  persistOwnerLastKnownGood,
} from "@/lib/billing/analytics/last-known-good";
import {
  loadMonthlyAiAggregatesFromDurable,
  summarizeMonthlyAiAggregates,
} from "@/lib/billing/usage/monthly-aggregate";
import { getUsageMonthKey } from "@/lib/billing/usage/period";
import {
  MODEL_PRICING_TABLE_UPDATED_AT,
  MODEL_PRICING_TABLE_VERSION,
} from "@/lib/ai/model-catalog";
import { getMonthlyCostSavingsSummary } from "@/lib/cost-optimization/cost-savings-tracker";
import { listAuditLogEntries } from "@/lib/owner/audit-log";
import {
  buildStripeWebhookMonitoringSnapshot,
  ensureWebhookTelemetryHydrated,
} from "@/lib/owner/billing-webhook/telemetry";
import { fetchRegisteredUserCount } from "@/lib/owner/registered-users";
import { listApiUsageRecords } from "@/lib/owner/api-usage/store";
import { listPopularityUsageEvents } from "@/lib/owner/popularity-ranking/store";
import { buildPopularityRankingSnapshot } from "@/lib/owner/popularity-ranking/engine";
import { getSupabaseServiceRoleEnv } from "@/lib/supabase/env";
import { ensureBillingUsageHydrated } from "@/lib/billing/usage/durable";
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
  lastKnownAmount?: number | null;
  lastKnownAt?: string | null;
  isLastKnownGood?: boolean;
}): OwnerCurrencyMetric {
  const isJpy = input.currency.toLowerCase() === "jpy";
  const amount = input.availability === "ok" ? input.amount : null;
  const lastKnown = input.lastKnownAmount ?? null;
  return {
    label: input.label,
    amountUsd: amount === null ? null : isJpy ? null : amount,
    amountJpy: amount === null ? null : isJpy ? Math.round(amount) : null,
    lastKnownAmountUsd: lastKnown === null ? null : isJpy ? null : lastKnown,
    lastKnownAmountJpy: lastKnown === null ? null : isJpy ? Math.round(lastKnown) : null,
    lastKnownAt: input.lastKnownAt ?? null,
    source: input.source,
    availability: input.availability,
    isEstimated: false,
    isLastKnownGood: input.isLastKnownGood ?? false,
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
  value: number | null;
  availability?: OwnerMetricAvailability;
  periodLabel: string;
  dataSourceLabel: string;
  lastUpdatedAt: string | null;
  stripeMode: OwnerStripeMode | null;
  statusMessage?: string | null;
  lastKnownValue?: number | null;
  lastKnownAt?: string | null;
  isLastKnownGood?: boolean;
}): OwnerCountMetric {
  const availability = input.availability ?? "ok";
  return {
    label: input.label,
    value: availability === "ok" ? input.value : null,
    lastKnownValue: input.lastKnownValue ?? null,
    lastKnownAt: input.lastKnownAt ?? null,
    isLastKnownGood: input.isLastKnownGood ?? false,
    availability,
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
      lastKnownAmountUsd: null,
      lastKnownAmountJpy: null,
      lastKnownAt: null,
      isLastKnownGood: false,
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
      lastKnownAmountUsd: null,
      lastKnownAmountJpy: null,
      lastKnownAt: null,
      isLastKnownGood: false,
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
    lastKnownAmountUsd: null,
    lastKnownAmountJpy: null,
    lastKnownAt: null,
    isLastKnownGood: false,
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
    const usageMonth = getUsageMonthKey(now);
    await ensureBillingUsageHydrated();
    await hydrateSubscriptionsFromSupabase();

    const localBilling = getOwnerBillingMetrics(now);
    const lastKnown = await loadOwnerLastKnownGood();
    const [stripe, stripeSubs, registered, aiDurable, webhookDurableReady] =
      await Promise.all([
        fetchStripeLiveMonthMetrics(now),
        fetchStripeSubscriptionLiveMetrics(),
        fetchRegisteredUserCount(),
        loadMonthlyAiAggregatesFromDurable(usageMonth),
        ensureWebhookTelemetryHydrated(),
      ]);

    const stripeMode = stripe.mode ?? localBilling.stripeMode;
    const modeText = modeLabel(stripeMode);
    const periodWithMode = `${modeText}·${periodLabel}`;
    const stripeSourceLabel = `${modeText} API（Invoice / Refund / BalanceTransaction）`;
    const supabaseServiceConfigured = Boolean(getSupabaseServiceRoleEnv());

    const stripeAvailability: OwnerMetricAvailability =
      stripe.availability === "ok"
        ? "ok"
        : stripe.availability === "incomplete"
          ? "incomplete"
          : stripe.availability === "failed"
            ? lastKnown?.stripeMonth
              ? "stale"
              : "failed"
            : lastKnown?.stripeMonth
              ? "stale"
              : "disconnected";

    const stripeIsCurrent = stripeAvailability === "ok";
    const stripeLkg = lastKnown?.stripeMonth;
    const stripeStatus =
      stripeAvailability === "ok"
        ? null
        : stripeAvailability === "incomplete"
          ? stripe.statusMessage ?? "Stripe集計が上限に達したため未完了"
          : stripeAvailability === "stale"
            ? `前回値（最終成功同期 ${stripeLkg?.fetchedAt ?? "不明"}）。現在値ではありません`
            : stripe.statusMessage ??
              (stripe.availability === "failed" ? "取得失敗" : "Stripe未接続");

    const billing =
      stripeSubs.availability === "ok" && stripeSubs.metrics
        ? stripeSubs.metrics
        : lastKnown?.stripeSubs
          ? {
              monthlyRevenueJpy: lastKnown.stripeSubs.mrrJpy,
              mrrJpy: lastKnown.stripeSubs.mrrJpy,
              paidSubscribers: lastKnown.stripeSubs.paidSubscribers,
              freeSubscribers: 0,
              churnedSubscribers: lastKnown.stripeSubs.churnedSubscribers,
              planBreakdown: lastKnown.stripeSubs.planBreakdown.map((row) => ({
                planId: row.planId as "light" | "standard" | "premium",
                planName: row.planName,
                monthlyPriceJpy: row.monthlyPriceJpy,
                activeSubscribers: row.activeSubscribers,
                mrrJpy: row.mrrJpy,
              })),
              stripeConnected: true,
            }
          : {
              ...localBilling,
              paidSubscribers: 0,
              freeSubscribers: 0,
            };

    const revenue = moneyMetric({
      label: "今月売上",
      amount: stripeIsCurrent ? stripe.grossRevenue : null,
      currency: stripe.currency,
      availability: stripeAvailability,
      source: "stripe",
      periodLabel: periodWithMode,
      dataSourceLabel: stripeSourceLabel,
      lastUpdatedAt: stripeIsCurrent ? stripe.fetchedAt : stripeLkg?.fetchedAt ?? null,
      stripeMode,
      statusMessage: stripeStatus,
      updateFailed: stripe.updateFailed || stripeAvailability === "stale",
      lastKnownAmount: stripeLkg?.grossRevenue ?? null,
      lastKnownAt: stripeLkg?.fetchedAt ?? null,
      isLastKnownGood: stripeAvailability === "stale",
    });

    const refunds = moneyMetric({
      label: "返金額",
      amount: stripeIsCurrent ? stripe.refunds : null,
      currency: stripe.currency,
      availability: stripeAvailability,
      source: "stripe",
      periodLabel: periodWithMode,
      dataSourceLabel: stripeSourceLabel,
      lastUpdatedAt: stripeIsCurrent ? stripe.fetchedAt : stripeLkg?.fetchedAt ?? null,
      stripeMode,
      statusMessage: stripeStatus,
      updateFailed: stripe.updateFailed || stripeAvailability === "stale",
      lastKnownAmount: stripeLkg?.refunds ?? null,
      lastKnownAt: stripeLkg?.fetchedAt ?? null,
      isLastKnownGood: stripeAvailability === "stale",
    });

    const stripeFees = moneyMetric({
      label: "Stripe手数料",
      amount: stripeIsCurrent ? stripe.fees : null,
      currency: stripe.currency,
      availability: stripeAvailability,
      source: "stripe",
      periodLabel: periodWithMode,
      dataSourceLabel: stripeSourceLabel,
      lastUpdatedAt: stripeIsCurrent ? stripe.fetchedAt : stripeLkg?.fetchedAt ?? null,
      stripeMode,
      statusMessage: stripeStatus,
      updateFailed: stripe.updateFailed || stripeAvailability === "stale",
      lastKnownAmount: stripeLkg?.fees ?? null,
      lastKnownAt: stripeLkg?.fetchedAt ?? null,
      isLastKnownGood: stripeAvailability === "stale",
    });

    const netRevenue = moneyMetric({
      label: "純売上",
      amount: stripeIsCurrent ? stripe.netRevenue : null,
      currency: stripe.currency,
      availability: stripeAvailability,
      source: "stripe",
      periodLabel: periodWithMode,
      dataSourceLabel: "売上 − 返金 − Stripe手数料",
      lastUpdatedAt: stripeIsCurrent ? stripe.fetchedAt : stripeLkg?.fetchedAt ?? null,
      stripeMode,
      statusMessage: stripeStatus,
      updateFailed: stripe.updateFailed || stripeAvailability === "stale",
      lastKnownAmount: stripeLkg?.netRevenue ?? null,
      lastKnownAt: stripeLkg?.fetchedAt ?? null,
      isLastKnownGood: stripeAvailability === "stale",
    });

    const aiEvents = listAiUsageEvents();
    const memoryMonth = summarizeMonthlyAiAggregates(usageMonth);
    const monthAi = aiDurable.ready && aiDurable.summary
      ? aiDurable.summary
      : memoryMonth;
    const aiFromAggregate =
      monthAi.requests > 0 ||
      monthAi.estimatedCostUsd > 0 ||
      (aiDurable.ready && aiDurable.rows.length > 0);
    const apiUsageOpenAiUsd = listApiUsageRecords()
      .filter(
        (row) =>
          row.providerId === "openai" && row.timestamp.startsWith(monthKey),
      )
      .reduce((sum, row) => sum + row.amountUsd, 0);
    const recordedOpenAiUsd =
      monthAi.estimatedCostUsd > 0
        ? monthAi.estimatedCostUsd
        : aiFromAggregate
          ? 0
          : apiUsageOpenAiUsd;
    const hasAiData = aiFromAggregate || apiUsageOpenAiUsd > 0;
    const latestAiAt =
      aiDurable.rows.reduce(
        (latest, row) => (row.updatedAt > latest ? row.updatedAt : latest),
        "",
      ) ||
      (aiEvents.length > 0
        ? aiEvents.reduce(
            (latest, event) =>
              event.timestamp > latest ? event.timestamp : latest,
            aiEvents[0]!.timestamp,
          )
        : null);

    const apiCost: OwnerCurrencyMetric = hasAiData
      ? {
          label: "今月OpenAI原価",
          amountUsd: Math.round(recordedOpenAiUsd * 100) / 100,
          amountJpy: null,
          lastKnownAmountUsd: lastKnown?.aiMonthly?.recordedCostUsd ?? null,
          lastKnownAmountJpy: null,
          lastKnownAt: lastKnown?.aiMonthly?.fetchedAt ?? null,
          source: "ai_usage",
          availability: "ok",
          isEstimated: false,
          isLastKnownGood: false,
          periodLabel: periodLabel,
          dataSourceLabel: aiDurable.ready
            ? `月次原価集計（イベント削除後も保持）× 料金表 ${MODEL_PRICING_TABLE_VERSION}`
            : `月次原価集計（プロセス内）× 料金表 ${MODEL_PRICING_TABLE_VERSION}`,
          lastUpdatedAt: latestAiAt || new Date().toISOString(),
          stripeMode: null,
          statusMessage: null,
          updateFailed: false,
        }
      : lastKnown?.aiMonthly && lastKnown.aiMonthly.month === usageMonth
        ? {
            label: "今月OpenAI原価",
            amountUsd: null,
            amountJpy: null,
            lastKnownAmountUsd: lastKnown.aiMonthly.recordedCostUsd,
            lastKnownAmountJpy: null,
            lastKnownAt: lastKnown.aiMonthly.fetchedAt,
            source: "ai_usage",
            availability: "stale",
            isEstimated: false,
            isLastKnownGood: true,
            periodLabel: periodLabel,
            dataSourceLabel: "前回取得値（月次原価集計）",
            lastUpdatedAt: lastKnown.aiMonthly.fetchedAt,
            stripeMode: null,
            statusMessage: `前回値（最終成功同期 ${lastKnown.aiMonthly.fetchedAt}）。現在値ではありません`,
            updateFailed: true,
          }
        : {
            label: "今月OpenAI原価",
            amountUsd: null,
            amountJpy: null,
            lastKnownAmountUsd: null,
            lastKnownAmountJpy: null,
            lastKnownAt: null,
            source: "ai_usage",
            availability: "empty",
            isEstimated: false,
            isLastKnownGood: false,
            periodLabel: periodLabel,
            dataSourceLabel: "atlas_billing_ai_monthly / 月次原価集計",
            lastUpdatedAt: null,
            stripeMode: null,
            statusMessage: "利用データなし",
            updateFailed: false,
          };

    const serverCost: OwnerCurrencyMetric = {
      label: "サーバー費用",
      amountUsd: null,
      amountJpy: null,
      lastKnownAmountUsd: null,
      lastKnownAmountJpy: null,
      lastKnownAt: null,
      source: "server",
      availability: "unset",
      isEstimated: false,
      isLastKnownGood: false,
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
      lastKnownAmountUsd: null,
      lastKnownAmountJpy: null,
      lastKnownAt: null,
      source: "external_api",
      availability: "unset",
      isEstimated: false,
      isLastKnownGood: false,
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
      lastUpdatedAt: stripeIsCurrent
        ? stripe.fetchedAt
        : stripeLkg?.fetchedAt ?? latestAiAt,
      netRevenueUsd: netRevenue.amountUsd,
      netRevenueJpy: netRevenue.amountJpy,
      currency: stripe.currency,
      apiCostUsd: apiCost.amountUsd,
      stripeFeesMajor: stripeIsCurrent ? stripe.fees : null,
      refundsMajor: stripeIsCurrent ? stripe.refunds : null,
      serverCostUsd: null,
      externalCostUsd: null,
      netAlreadySubtractsFeesAndRefunds: true,
    });

    const webhookSnap = buildStripeWebhookMonitoringSnapshot(now, {
      durableReady: webhookDurableReady,
    });
    const webhookAvailability: OwnerMetricAvailability =
      webhookSnap.availability === "ok"
        ? "ok"
        : webhookSnap.availability === "empty"
          ? "empty"
          : webhookSnap.availability === "stale"
            ? "stale"
            : webhookSnap.availability === "failed"
              ? "failed"
              : "unavailable";

    const paidAvailability: OwnerMetricAvailability =
      stripeSubs.availability === "ok"
        ? "ok"
        : stripeSubs.availability === "incomplete"
          ? "incomplete"
          : stripeSubs.availability === "failed"
            ? lastKnown?.stripeSubs
              ? "stale"
              : "failed"
            : lastKnown?.stripeSubs
              ? "stale"
              : "disconnected";
    const paidIsCurrent = paidAvailability === "ok";
    const paidValue = paidIsCurrent
      ? stripeSubs.metrics?.paidSubscribers ?? 0
      : null;
    const paidLastKnown = lastKnown?.stripeSubs?.paidSubscribers ?? null;

    const totalAvailability: OwnerMetricAvailability =
      registered.availability === "ok"
        ? "ok"
        : registered.availability === "failed"
          ? lastKnown?.registeredUsers
            ? "stale"
            : "failed"
          : lastKnown?.registeredUsers
            ? "stale"
            : "disconnected";
    const totalIsCurrent = totalAvailability === "ok";
    const totalValue = totalIsCurrent ? registered.total : null;
    const totalLastKnown = lastKnown?.registeredUsers?.total ?? null;

    let freeAvailability: OwnerMetricAvailability = "unavailable";
    let freeValue: number | null = null;
    let freeStatus: string | null = "登録数または有料数が未取得のため算出不能";
    if (totalIsCurrent && paidIsCurrent && totalValue !== null && paidValue !== null) {
      freeAvailability = "ok";
      freeValue = Math.max(0, totalValue - paidValue);
      freeStatus = null;
    } else if (totalAvailability === "stale" || paidAvailability === "stale") {
      freeAvailability = "stale";
      freeStatus = "前回値から算出していません。現在値ではありません";
    } else if (paidAvailability === "incomplete") {
      freeAvailability = "incomplete";
      freeStatus = "Stripe集計が上限に達したため未完了";
    } else if (paidAvailability === "failed" || totalAvailability === "failed") {
      freeAvailability = "failed";
      freeStatus = "取得失敗（Free=0として扱いません）";
    } else if (
      paidAvailability === "disconnected" ||
      totalAvailability === "disconnected"
    ) {
      freeAvailability = "disconnected";
      freeStatus = "登録ユーザーまたはStripe未接続のため算出不能";
    }

    const cancelScheduled =
      paidIsCurrent ? stripeSubs.cancelScheduledCount : null;
    const paymentFailures = localBilling.paymentFailureCount;

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

    if (stripeIsCurrent && stripe.grossRevenue !== null) {
      void persistOwnerLastKnownGood(
        mergeOwnerLastKnownGood(lastKnown, {
          updatedAt: generatedAt,
          stripeMonth: {
            fetchedAt: stripe.fetchedAt ?? generatedAt,
            mode: stripe.mode,
            currency: stripe.currency,
            grossRevenue: stripe.grossRevenue,
            refunds: stripe.refunds ?? 0,
            fees: stripe.fees ?? 0,
            netRevenue: stripe.netRevenue ?? 0,
            upcomingPayoutAmount: stripe.upcomingPayoutAmount,
            upcomingPayoutAt: stripe.upcomingPayoutAt,
            upcomingPayoutStatus: stripe.upcomingPayoutStatus,
          },
        }),
      );
    }
    if (paidIsCurrent && stripeSubs.metrics) {
      void persistOwnerLastKnownGood(
        mergeOwnerLastKnownGood(lastKnown, {
          updatedAt: generatedAt,
          stripeSubs: {
            fetchedAt: stripeSubs.fetchedAt ?? generatedAt,
            paidSubscribers: stripeSubs.metrics.paidSubscribers,
            cancelScheduledCount: stripeSubs.cancelScheduledCount ?? 0,
            churnedSubscribers: stripeSubs.metrics.churnedSubscribers,
            planBreakdown: stripeSubs.metrics.planBreakdown,
            mrrJpy: stripeSubs.metrics.mrrJpy,
          },
        }),
      );
    }
    if (totalIsCurrent && registered.total !== null) {
      void persistOwnerLastKnownGood(
        mergeOwnerLastKnownGood(lastKnown, {
          updatedAt: generatedAt,
          registeredUsers: {
            fetchedAt: registered.fetchedAt ?? generatedAt,
            total: registered.total,
          },
        }),
      );
    }
    if (hasAiData) {
      void persistOwnerLastKnownGood(
        mergeOwnerLastKnownGood(lastKnown, {
          updatedAt: generatedAt,
          aiMonthly: {
            fetchedAt: latestAiAt || generatedAt,
            month: usageMonth,
            requests: monthAi.requests,
            inputTokens: monthAi.inputTokens,
            outputTokens: monthAi.outputTokens,
            totalTokens: monthAi.totalTokens,
            recordedCostUsd: Math.round(recordedOpenAiUsd * 100) / 100,
          },
        }),
      );
    }

    return {
      metricsProvider: "live",
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
        total: totalValue,
        paid: paidValue,
        free: freeValue,
        churned: paidIsCurrent
          ? stripeSubs.metrics?.churnedSubscribers ?? 0
          : null,
        cancelScheduled,
        paymentFailures: null,
      },
      userMetrics: {
        total: countMetric({
          label: "登録ユーザー数",
          value: totalValue,
          availability: totalAvailability,
          periodLabel: periodLabel,
          dataSourceLabel: "Clerk Backend API（登録の正）",
          lastUpdatedAt: totalIsCurrent
            ? registered.fetchedAt
            : lastKnown?.registeredUsers?.fetchedAt ?? null,
          stripeMode: null,
          statusMessage:
            totalAvailability === "ok"
              ? null
              : totalAvailability === "stale"
                ? `前回値（最終成功同期 ${lastKnown?.registeredUsers?.fetchedAt ?? "不明"}）。現在値ではありません`
                : registered.statusMessage ?? "登録ユーザー数を取得できません",
          lastKnownValue: totalLastKnown,
          lastKnownAt: lastKnown?.registeredUsers?.fetchedAt ?? null,
          isLastKnownGood: totalAvailability === "stale",
        }),
        paid: countMetric({
          label: "有料ユーザー数",
          value: paidValue,
          availability: paidAvailability,
          periodLabel: periodLabel,
          dataSourceLabel: "Stripe Subscriptions（allowlist Price・active/trialing）",
          lastUpdatedAt: paidIsCurrent
            ? stripeSubs.fetchedAt
            : lastKnown?.stripeSubs?.fetchedAt ?? null,
          stripeMode,
          statusMessage:
            paidAvailability === "ok"
              ? stripeSubs.statusMessage
              : paidAvailability === "stale"
                ? `前回値（最終成功同期 ${lastKnown?.stripeSubs?.fetchedAt ?? "不明"}）。現在値ではありません`
                : paidAvailability === "incomplete"
                  ? "Stripe集計が上限に達したため未完了"
                  : stripeSubs.statusMessage ?? "有料ユーザー数を取得できません",
          lastKnownValue: paidLastKnown,
          lastKnownAt: lastKnown?.stripeSubs?.fetchedAt ?? null,
          isLastKnownGood: paidAvailability === "stale",
        }),
        free: countMetric({
          label: "Freeユーザー数",
          value: freeValue,
          availability: freeAvailability,
          periodLabel: periodLabel,
          dataSourceLabel: "登録ユーザー数 − 有料ユーザー数",
          lastUpdatedAt:
            totalIsCurrent && paidIsCurrent
              ? registered.fetchedAt ?? stripeSubs.fetchedAt
              : null,
          stripeMode,
          statusMessage: freeStatus,
        }),
        cancelScheduled: countMetric({
          label: "解約予定数",
          value: cancelScheduled,
          availability: paidIsCurrent
            ? "ok"
            : paidAvailability === "stale"
              ? "stale"
              : paidAvailability,
          periodLabel: periodLabel,
          dataSourceLabel:
            stripeSubs.availability === "ok"
              ? "Stripe cancel_at_period_end"
              : "cancelAtPeriodEnd",
          lastUpdatedAt: paidIsCurrent
            ? stripeSubs.fetchedAt
            : lastKnown?.stripeSubs?.fetchedAt ?? null,
          stripeMode,
          lastKnownValue: lastKnown?.stripeSubs?.cancelScheduledCount ?? null,
          lastKnownAt: lastKnown?.stripeSubs?.fetchedAt ?? null,
          isLastKnownGood: paidAvailability === "stale",
          statusMessage:
            paidIsCurrent
              ? null
              : "有料契約の取得に依存するため、未取得時は人数を0にしません",
        }),
        paymentFailures: countMetric({
          label: "支払い失敗数（今月）",
          value: paymentFailures,
          availability: "empty",
          periodLabel: periodLabel,
          dataSourceLabel: "Stripe Dashboard（Owner集計は未確定）",
          lastUpdatedAt: null,
          stripeMode,
          statusMessage:
            "確認不能。支払い失敗は Stripe Dashboard で確認してください。",
        }),
      },
      screenRefreshedAt: generatedAt,
      aiUsage: {
        availability: hasAiData ? "ok" : "empty",
        statusMessage: hasAiData ? null : "利用データなし",
        requests: monthAi.requests,
        inputTokens: monthAi.inputTokens,
        outputTokens: monthAi.outputTokens,
        totalTokens: monthAi.totalTokens,
        recordedCostUsd: Math.round(recordedOpenAiUsd * 100) / 100,
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
        lastUpdatedAt: hasAiData ? latestAiAt : hasRunData ? generatedAt : null,
        dataSourceLabel: "月次原価集計 / 監査ログ",
      },
      webhook: {
        successRatePercent: webhookSnap.successRatePercent,
        lastSyncedAt: webhookSnap.lastSyncedAt,
        totalCount: webhookSnap.totalCount,
        failureCount: webhookSnap.failureCount,
        availability: webhookAvailability,
        statusMessage: webhookSnap.statusMessage,
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
        lastUpdatedAt: stripeIsCurrent
          ? stripe.fetchedAt
          : stripeLkg?.fetchedAt ?? null,
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
          label: "契約（Stripe / store）",
          connected:
            stripeSubs.availability === "ok" ||
            localBilling.hasSubscriptionRecords,
          note:
            stripeSubs.availability === "ok"
              ? "Stripe Subscriptions API"
              : localBilling.hasSubscriptionRecords
                ? "Webhook同期の契約ストア"
                : "データなし",
        },
        {
          id: "webhook_log",
          label: "Webhook監視（決済状態の正ではない）",
          connected: webhookSnap.durable && webhookSnap.totalCount > 0,
          note:
            webhookSnap.availability === "ok"
              ? `永続監視ログ · 成功率 ${webhookSnap.successRatePercent ?? "—"}%`
              : webhookSnap.statusMessage ??
                "Webhook監視を確認できません。正式な決済状態は Stripe Dashboard が正です。",
        },
        {
          id: "server",
          label: "Supabase（永続化）",
          connected: supabaseServiceConfigured,
          note: supabaseServiceConfigured
            ? "SERVICE_ROLE で atlas_user_state 書き込み可"
            : "SUPABASE_SERVICE_ROLE_KEY 未設定（Production で必須）",
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

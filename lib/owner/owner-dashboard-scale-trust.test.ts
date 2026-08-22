import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetBillingHistoryStore } from "@/lib/billing/history/store";
import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { recordUserAiUsage } from "@/lib/billing/usage/meter";
import {
  listAiUsageEvents,
  resetUsageStore,
} from "@/lib/billing/usage/store";
import {
  resetMonthlyAiAggregates,
  summarizeMonthlyAiAggregates,
} from "@/lib/billing/usage/monthly-aggregate";
import { getUsageMonthKey } from "@/lib/billing/usage/period";
import { getOwnerDashboardSnapshot } from "@/lib/owner/service";
import { recordStripeWebhookLog } from "@/lib/owner/billing-webhook/telemetry";
import {
  buildStripeWebhookMonitoringSnapshot,
  resetWebhookTelemetryHydrateForTests,
} from "@/lib/owner/billing-webhook/telemetry";
import {
  replaceStripeWebhookLogs,
  resetStripeWebhookLogStore,
} from "@/lib/owner/billing-webhook/store";
import { resetOwnerLastKnownGoodForTests } from "@/lib/billing/analytics/last-known-good";

const registered = vi.hoisted(() => ({
  total: 100,
  availability: "ok" as "ok" | "failed" | "disconnected",
}));

const stripeSubs = vi.hoisted(() => ({
  availability: "ok" as "ok" | "failed" | "disconnected" | "incomplete",
  paid: 10,
}));

const stripeMonth = vi.hoisted(() => ({
  availability: "ok" as "ok" | "failed" | "disconnected" | "incomplete",
  gross: 1960,
  refunds: 0,
  fees: 72,
  net: 1888,
}));

vi.mock("@/lib/owner/registered-users", () => ({
  fetchRegisteredUserCount: async () =>
    registered.availability === "ok"
      ? {
          source: "clerk" as const,
          availability: "ok" as const,
          total: registered.total,
          fetchedAt: "2026-08-22T05:00:00.000Z",
          statusMessage: null,
        }
      : {
          source: "clerk" as const,
          availability: registered.availability,
          total: null,
          fetchedAt: registered.availability === "failed" ? "2026-08-22T05:00:00.000Z" : null,
          statusMessage: "登録ユーザー数の取得に失敗しました",
        },
}));

vi.mock("@/lib/billing/analytics/stripe-subscription-metrics", () => ({
  fetchStripeSubscriptionLiveMetrics: async () =>
    stripeSubs.availability === "ok"
      ? {
          connected: true,
          availability: "ok" as const,
          statusMessage: null,
          fetchedAt: "2026-08-22T05:00:00.000Z",
          cancelScheduledCount: 0,
          paymentFailureCount: null,
          metrics: {
            monthlyRevenueJpy: 9800,
            mrrJpy: 9800,
            paidSubscribers: stripeSubs.paid,
            freeSubscribers: 0,
            churnedSubscribers: 0,
            planBreakdown: [
              {
                planId: "light" as const,
                planName: "Light",
                monthlyPriceJpy: 980,
                activeSubscribers: stripeSubs.paid,
                mrrJpy: 980 * stripeSubs.paid,
              },
              {
                planId: "standard" as const,
                planName: "Standard",
                monthlyPriceJpy: 2980,
                activeSubscribers: 0,
                mrrJpy: 0,
              },
              {
                planId: "premium" as const,
                planName: "Premium",
                monthlyPriceJpy: 9800,
                activeSubscribers: 0,
                mrrJpy: 0,
              },
            ],
            stripeConnected: true,
          },
        }
      : {
          connected: true,
          availability: stripeSubs.availability,
          statusMessage: "取得失敗",
          fetchedAt: "2026-08-22T05:00:00.000Z",
          metrics: null,
          cancelScheduledCount: null,
          paymentFailureCount: null,
        },
}));

vi.mock("@/lib/billing/analytics/stripe-live-metrics", () => ({
  fetchStripeLiveMonthMetrics: async () =>
    stripeMonth.availability === "ok"
      ? {
          connected: true,
          mode: "test" as const,
          availability: "ok" as const,
          statusMessage: null,
          updateFailed: false,
          fetchedAt: "2026-08-22T05:00:00.000Z",
          grossRevenue: stripeMonth.gross,
          refunds: stripeMonth.refunds,
          fees: stripeMonth.fees,
          netRevenue: stripeMonth.net,
          currency: "jpy",
          upcomingPayoutAmount: null,
          upcomingPayoutAt: null,
          upcomingPayoutStatus: null,
        }
      : {
          connected: true,
          mode: "test" as const,
          availability: stripeMonth.availability,
          statusMessage: "取得失敗",
          updateFailed: true,
          fetchedAt: "2026-08-22T05:00:00.000Z",
          grossRevenue: null,
          refunds: null,
          fees: null,
          netRevenue: null,
          currency: "jpy",
          upcomingPayoutAmount: null,
          upcomingPayoutAt: null,
          upcomingPayoutStatus: null,
        },
  getConfiguredStripeMode: () => "test" as const,
}));

vi.mock("@/lib/billing/usage/durable", () => ({
  ensureBillingUsageHydrated: vi.fn().mockResolvedValue(undefined),
  BILLING_USAGE_DOMAIN_KEY: "atlasBillingUsage",
}));

vi.mock("@/lib/billing/analytics/last-known-good", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/billing/analytics/last-known-good")
  >("@/lib/billing/analytics/last-known-good");
  return {
    ...actual,
    persistOwnerLastKnownGood: vi.fn().mockResolvedValue(false),
  };
});

describe("owner dashboard scale & financial trust", () => {
  beforeEach(() => {
    resetSubscriptionStore();
    resetBillingHistoryStore();
    resetUsageStore();
    resetMonthlyAiAggregates();
    resetStripeWebhookLogStore();
    resetWebhookTelemetryHydrateForTests();
    resetOwnerLastKnownGoodForTests();
    registered.total = 100;
    registered.availability = "ok";
    stripeSubs.availability = "ok";
    stripeSubs.paid = 10;
    stripeMonth.availability = "ok";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("A/B: 100 registered / 10 paid → total 100, paid 10, free 90 including Stripe-less Free users", async () => {
    const snapshot = await getOwnerDashboardSnapshot(new Date("2026-08-22"));
    expect(snapshot.users.total).toBe(100);
    expect(snapshot.users.paid).toBe(10);
    expect(snapshot.users.free).toBe(90);
    expect(snapshot.userMetrics.total.availability).toBe("ok");
    expect(snapshot.userMetrics.paid.availability).toBe("ok");
    expect(snapshot.userMetrics.free.availability).toBe("ok");
  });

  it("C: Stripe fetch failure does not display paid=0", async () => {
    stripeSubs.availability = "failed";
    stripeMonth.availability = "failed";
    const snapshot = await getOwnerDashboardSnapshot(new Date("2026-08-22"));
    expect(snapshot.users.paid).toBeNull();
    expect(snapshot.userMetrics.paid.availability).toBe("failed");
    expect(snapshot.userMetrics.paid.value).toBeNull();
    expect(snapshot.revenue.availability).toBe("failed");
    expect(snapshot.revenue.amountJpy).toBeNull();
    expect(snapshot.userMetrics.free.availability).toBe("failed");
    expect(snapshot.users.free).toBeNull();
  });

  it("D: monthly AI totals survive trimming past 5000 detail events", () => {
    const now = new Date("2026-08-22T10:00:00.000Z");
    const month = getUsageMonthKey(now);
    for (let i = 0; i < 5001; i += 1) {
      recordUserAiUsage({
        userId: `user_${i % 20}`,
        api: "orchestrate",
        feature: "workspace",
        model: "gpt-5-mini",
        inputTokens: 10,
        outputTokens: 5,
        estimatedCostUsd: 0.01,
        timestamp: now.toISOString(),
        planId: "free",
      });
    }
    expect(listAiUsageEvents().length).toBe(5000);
    const monthSummary = summarizeMonthlyAiAggregates(month);
    expect(monthSummary.requests).toBe(5001);
    expect(monthSummary.inputTokens).toBe(50010);
    expect(monthSummary.outputTokens).toBe(25005);
    expect(monthSummary.estimatedCostUsd).toBeCloseTo(50.01, 2);
  });

  it("E: webhook telemetry restores after in-memory cold start", () => {
    recordStripeWebhookLog({
      stripeEventId: "evt_cold_1",
      eventType: "checkout.session.completed",
      status: "success",
      message: "ok",
    });
    recordStripeWebhookLog({
      stripeEventId: "evt_cold_2",
      eventType: "invoice.payment_failed",
      status: "failure",
      message: "card",
    });
    const before = buildStripeWebhookMonitoringSnapshot(new Date(), {
      durableReady: true,
    });
    const durableCopy = before.recentWebhooks;
    resetStripeWebhookLogStore();
    resetWebhookTelemetryHydrateForTests();
    const empty = buildStripeWebhookMonitoringSnapshot(new Date(), {
      durableReady: false,
    });
    expect(empty.availability).toBe("unavailable");
    expect(empty.failureCount).toBeNull();
    replaceStripeWebhookLogs(durableCopy);
    const restored = buildStripeWebhookMonitoringSnapshot(new Date(), {
      durableReady: true,
    });
    expect(restored.totalCount).toBe(2);
    expect(restored.failureCount).toBe(1);
    expect(restored.successRatePercent).toBe(50);
  });

  it("F: duplicate stripeEventId is not counted twice", () => {
    recordStripeWebhookLog({
      stripeEventId: "evt_once",
      eventType: "invoice.paid",
      status: "success",
      message: "first",
    });
    recordStripeWebhookLog({
      stripeEventId: "evt_once",
      eventType: "invoice.paid",
      status: "success",
      message: "retry",
    });
    const snapshot = buildStripeWebhookMonitoringSnapshot(new Date(), {
      durableReady: true,
    });
    expect(snapshot.totalCount).toBe(1);
  });

  it("H: 980円 × 2 users flows into owner net revenue", async () => {
    const snapshot = await getOwnerDashboardSnapshot(new Date("2026-08-22"));
    expect(snapshot.revenue.amountJpy).toBe(1960);
    expect(snapshot.stripeFees.amountJpy).toBe(72);
    expect(snapshot.refunds.amountJpy).toBe(0);
    expect(snapshot.netRevenue.amountJpy).toBe(1888);
  });

  it("J: failed owner metrics never render as 0 people / 0 yen", async () => {
    stripeSubs.availability = "failed";
    stripeMonth.availability = "failed";
    registered.availability = "failed";
    const snapshot = await getOwnerDashboardSnapshot(new Date("2026-08-22"));
    expect(snapshot.revenue.amountJpy).toBeNull();
    expect(snapshot.users.total).toBeNull();
    expect(snapshot.users.paid).toBeNull();
    expect(snapshot.users.free).toBeNull();
    expect(snapshot.profit.availability).toBe("incomplete");
    expect(snapshot.profit.amountJpy).toBeNull();
    expect(snapshot.profit.amountUsd).toBeNull();
  });

  it("K: Light/Standard/Premium list prices stay 980 / 2980 / 9800", async () => {
    const { getPlanDefinition } = await import("@/lib/billing/plans/registry");
    expect(getPlanDefinition("light").monthlyPriceJpy).toBe(980);
    expect(getPlanDefinition("standard").monthlyPriceJpy).toBe(2980);
    expect(getPlanDefinition("premium").monthlyPriceJpy).toBe(9800);
  });

  it("keeps last successful Stripe sync separate from screen refresh", async () => {
    const snapshot = await getOwnerDashboardSnapshot(
      new Date("2026-08-22T14:30:00.000Z"),
    );
    expect(snapshot.screenRefreshedAt).toBe("2026-08-22T14:30:00.000Z");
    expect(snapshot.revenue.lastUpdatedAt).toBe("2026-08-22T05:00:00.000Z");
    expect(snapshot.revenue.lastUpdatedAt).not.toBe(snapshot.screenRefreshedAt);
  });
});

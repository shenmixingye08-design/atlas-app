import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isAtlasOwnerEmail,
  parseAtlasOwnerEmails,
} from "@/lib/auth/is-atlas-owner";
import { getOwnerDashboardSnapshot } from "@/lib/owner/service";
import { resetBillingHistoryStore } from "@/lib/billing/history/store";
import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { resetUsageStore } from "@/lib/billing/usage/store";

vi.mock("@/lib/billing/analytics/stripe-live-metrics", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/billing/analytics/stripe-live-metrics")
  >("@/lib/billing/analytics/stripe-live-metrics");
  return {
    ...actual,
    fetchStripeLiveMonthMetrics: vi.fn(),
  };
});

describe("isAtlasOwnerEmail", () => {
  beforeEach(() => {
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test, admin@atlas.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses owner emails from env", () => {
    expect(parseAtlasOwnerEmails()).toEqual([
      "owner@atlas.test",
      "admin@atlas.test",
    ]);
  });

  it("matches owner emails case-insensitively", () => {
    expect(isAtlasOwnerEmail("Owner@Atlas.test")).toBe(true);
    expect(isAtlasOwnerEmail("user@example.com")).toBe(false);
    expect(isAtlasOwnerEmail(null)).toBe(false);
  });

  it("denies everyone when env is empty", () => {
    vi.stubEnv("ATLAS_OWNER_EMAILS", "");
    expect(isAtlasOwnerEmail("owner@atlas.test")).toBe(false);
  });
});

describe("owner dashboard real metrics", () => {
  beforeEach(async () => {
    resetSubscriptionStore();
    resetBillingHistoryStore();
    resetUsageStore();
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    const { fetchStripeLiveMonthMetrics } = await import(
      "@/lib/billing/analytics/stripe-live-metrics"
    );
    vi.mocked(fetchStripeLiveMonthMetrics).mockResolvedValue({
      connected: false,
      mode: null,
      availability: "disconnected",
      statusMessage: "Stripe未接続",
      updateFailed: false,
      fetchedAt: null,
      grossRevenue: 0,
      refunds: 0,
      fees: 0,
      netRevenue: 0,
      currency: "jpy",
      upcomingPayoutAmount: null,
      upcomingPayoutAt: null,
      upcomingPayoutStatus: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("shows Stripe未接続 without inventing revenue", async () => {
    const snapshot = await getOwnerDashboardSnapshot(new Date("2026-07-12"));
    expect(snapshot.revenue.availability).toBe("disconnected");
    expect(snapshot.revenue.amountJpy).toBeNull();
    expect(snapshot.revenue.amountUsd).toBeNull();
    expect(snapshot.revenue.statusMessage).toContain("Stripe");
    expect(snapshot.users.paid).toBe(0);
    expect(snapshot.billing.mrrJpy).toBe(0);
    expect(snapshot.popularFeatures).toEqual([]);
    expect(snapshot.highCostUsers).toEqual([]);
    expect(snapshot.profit.availability).toBe("incomplete");
    expect(snapshot.serverCost.availability).toBe("unset");
    expect(snapshot.externalCost.availability).toBe("unset");
    expect(snapshot.apiCost.availability).toBe("empty");
  });

  it("uses Stripe test-mode live amounts when connected", async () => {
    const { fetchStripeLiveMonthMetrics } = await import(
      "@/lib/billing/analytics/stripe-live-metrics"
    );
    vi.mocked(fetchStripeLiveMonthMetrics).mockResolvedValue({
      connected: true,
      mode: "test",
      availability: "ok",
      statusMessage: null,
      updateFailed: false,
      fetchedAt: "2026-07-12T02:10:00.000Z",
      grossRevenue: 0,
      refunds: 0,
      fees: 0,
      netRevenue: 0,
      currency: "jpy",
      upcomingPayoutAmount: null,
      upcomingPayoutAt: null,
      upcomingPayoutStatus: null,
    });

    const snapshot = await getOwnerDashboardSnapshot(new Date("2026-07-12"));
    expect(snapshot.stripeMode).toBe("test");
    expect(snapshot.revenue.availability).toBe("ok");
    expect(snapshot.revenue.amountJpy).toBe(0);
    expect(snapshot.revenue.isEstimated).toBe(false);
  });

  it("records live revenue, refunds, and fees", async () => {
    const { fetchStripeLiveMonthMetrics } = await import(
      "@/lib/billing/analytics/stripe-live-metrics"
    );
    vi.mocked(fetchStripeLiveMonthMetrics).mockResolvedValue({
      connected: true,
      mode: "live",
      availability: "ok",
      statusMessage: null,
      updateFailed: false,
      fetchedAt: "2026-07-12T02:10:00.000Z",
      grossRevenue: 12000,
      refunds: 1000,
      fees: 432,
      netRevenue: 10568,
      currency: "jpy",
      upcomingPayoutAmount: 9000,
      upcomingPayoutAt: "2026-07-20T00:00:00.000Z",
      upcomingPayoutStatus: "pending",
    });

    const snapshot = await getOwnerDashboardSnapshot(new Date("2026-07-12"));
    expect(snapshot.stripeMode).toBe("live");
    expect(snapshot.revenue.amountJpy).toBe(12000);
    expect(snapshot.refunds.amountJpy).toBe(1000);
    expect(snapshot.stripeFees.amountJpy).toBe(432);
    expect(snapshot.netRevenue.amountJpy).toBe(10568);
    expect(snapshot.nextStripePayout.amountJpy).toBe(9000);
  });

  it("marks Stripe fetch failures without silent prior values", async () => {
    const { fetchStripeLiveMonthMetrics } = await import(
      "@/lib/billing/analytics/stripe-live-metrics"
    );
    vi.mocked(fetchStripeLiveMonthMetrics).mockResolvedValue({
      connected: true,
      mode: "live",
      availability: "failed",
      statusMessage: "取得失敗",
      updateFailed: true,
      fetchedAt: "2026-07-12T02:10:00.000Z",
      grossRevenue: 0,
      refunds: 0,
      fees: 0,
      netRevenue: 0,
      currency: "jpy",
      upcomingPayoutAmount: null,
      upcomingPayoutAt: null,
      upcomingPayoutStatus: null,
    });

    const snapshot = await getOwnerDashboardSnapshot(new Date("2026-07-12"));
    expect(snapshot.revenue.availability).toBe("failed");
    expect(snapshot.revenue.updateFailed).toBe(true);
    expect(snapshot.revenue.amountJpy).toBeNull();
  });

  it("aggregates recorded AI usage without inventing tokens", async () => {
    const { recordUserAiUsage } = await import("@/lib/billing/usage/meter");
    recordUserAiUsage({
      userId: "user_cost_1",
      api: "orchestrate",
      feature: "workspace",
      model: "gpt-5-mini",
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.12,
      timestamp: "2026-07-10T10:00:00.000Z",
      planId: "standard",
    });

    const snapshot = await getOwnerDashboardSnapshot(new Date("2026-07-12"));
    expect(snapshot.apiCost.availability).toBe("ok");
    expect(snapshot.apiCost.amountUsd).toBe(0.12);
    expect(snapshot.aiUsage.inputTokens).toBe(100);
    expect(snapshot.aiUsage.outputTokens).toBe(50);
    expect(snapshot.highCostUsers.length).toBe(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { recordUserAiUsage } from "@/lib/billing/usage/meter";
import { resetUsageStore } from "@/lib/billing/usage/store";
import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { resetErrorMonitoringStore } from "@/lib/owner/error-monitoring/store";
import { recordOwnerError } from "@/lib/owner/error-monitoring/store";
import { buildErrorMonitoringSnapshot } from "@/lib/owner/error-monitoring/service";
import { resetOwnerUserAdminStoreForTests } from "@/lib/owner/user-admin";
import { listRecentJobs, resetAutomationJobStoreForTests, upsertJobRecord } from "@/lib/jobs/job-store";

vi.mock("@/lib/billing/analytics/stripe-live-metrics", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/billing/analytics/stripe-live-metrics")>();
  const disconnectedCash = {
    connected: false,
    mode: null,
    availability: "disconnected" as const,
    statusMessage: "Stripe未接続",
    updateFailed: false,
    fetchedAt: null,
    grossRevenue: 0,
    refunds: 0,
    fees: 0,
    netRevenue: 0,
    currency: "jpy",
  };
  return {
    ...actual,
    fetchStripeLiveMonthMetrics: vi.fn(async () => ({
      ...disconnectedCash,
      upcomingPayoutAmount: null,
      upcomingPayoutAt: null,
      upcomingPayoutStatus: null,
    })),
    fetchStripeLiveTodayMetrics: vi.fn(async () => disconnectedCash),
    fetchStripeLiveCumulativeMetrics: vi.fn(async () => disconnectedCash),
  };
});

vi.mock("@/lib/billing/analytics/stripe-subscription-metrics", () => ({
  fetchStripeSubscriptionLiveMetrics: vi.fn(async () => ({
    connected: false,
    availability: "disconnected" as const,
    statusMessage: "Stripe未接続",
    fetchedAt: null,
    metrics: null,
    cancelScheduledCount: 0,
    paymentFailureCount: 0,
  })),
}));

vi.mock("@/lib/billing/usage/durable", () => ({
  ensureBillingUsageHydrated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/billing/subscriptions/store", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/billing/subscriptions/store")
  >("@/lib/billing/subscriptions/store");
  return {
    ...actual,
    hydrateSubscriptionsFromSupabase: vi.fn().mockResolvedValue(undefined),
  };
});

describe("executive dashboard real data", () => {
  beforeEach(() => {
    resetUsageStore();
    resetSubscriptionStore();
    resetErrorMonitoringStore();
    resetOwnerUserAdminStoreForTests();
    resetAutomationJobStoreForTests();
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@minervot.test,admin@minervot.test");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("aggregates AI model costs from real usage events only", async () => {
    recordUserAiUsage({
      userId: "user_a",
      api: "responses",
      feature: "sales_material",
      model: "gpt-5.5",
      inputTokens: 1000,
      outputTokens: 500,
      estimatedCostUsd: 0.12,
    });
    recordUserAiUsage({
      userId: "user_a",
      api: "responses",
      feature: "sales_material",
      model: "text-embedding-3-small",
      inputTokens: 200,
      outputTokens: 0,
      estimatedCostUsd: 0.01,
    });

    const { getExecutiveDashboardSnapshot } = await import("./service");
    const snapshot = await getExecutiveDashboardSnapshot("month");

    expect(snapshot.aiByModel.length).toBeGreaterThanOrEqual(2);
    expect(snapshot.apiCostLog[0]?.featureId).toBe("sales_material");
    expect(snapshot.apiCostLog[0]?.totalCostUsd).toBeCloseTo(0.13, 2);
    expect(snapshot.kpis.some((k) => k.id === "arr")).toBe(true);
    expect(snapshot.ownerEmails).toEqual([
      "owner@minervot.test",
      "admin@minervot.test",
    ]);
    // No invented Stripe cash when disconnected
    const today = snapshot.kpis.find((k) => k.id === "today_revenue");
    expect(today?.availability).toBe("disconnected");
  });

  it("stores stack traces in error center", () => {
    recordOwnerError({
      categoryId: "vision",
      message: "Vision timeout",
      source: "test",
      stackTrace: "Error: Vision timeout\n    at runVision",
    });
    const snapshot = buildErrorMonitoringSnapshot();
    const vision = snapshot.categories.find((c) => c.categoryId === "vision");
    expect(vision?.lastStackTrace).toContain("runVision");
    expect(snapshot.recentEvents[0]?.stackTrace).toContain("runVision");
  });

  it("lists real jobs without fabricating rows", async () => {
    const now = new Date().toISOString();
    await upsertJobRecord({
      id: "job_test_1",
      userId: "user_a",
      automationId: null,
      jobType: "x_recurring_post",
      status: "running",
      scheduledAt: null,
      queuedAt: now,
      startedAt: now,
      completedAt: null,
      failedAt: null,
      currentStep: "post",
      progressPercent: 40,
      attemptCount: 1,
      maxAttempts: 3,
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      resultSummary: null,
      artifactId: null,
      externalResultId: null,
      externalResultUrl: null,
      idempotencyKey: "idem_test_1",
      pushStatus: "pending",
      autoRecovered: false,
      steps: [],
      createdAt: now,
      updatedAt: now,
    });

    const rows = await listRecentJobs({ limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("running");
  });
});

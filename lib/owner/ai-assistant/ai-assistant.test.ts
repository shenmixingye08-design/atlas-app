import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { recordUserAiUsage } from "@/lib/billing/usage/meter";
import { resetUsageStore } from "@/lib/billing/usage/store";
import { resetSubscriptionStore } from "@/lib/billing/subscriptions/store";
import { resetAssistantAiCacheForTests } from "./cache";
import { detectCostAnomalies } from "./anomalies";
import { buildHqSimulations } from "./hq-simulator";
import { estimateHqRunJpy } from "./insights";
import type { AssistantFacts } from "./facts";

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

vi.mock("@/lib/billing/analytics/stripe-live-metrics", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/billing/analytics/stripe-live-metrics")>();
  const disconnected = {
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
      ...disconnected,
      upcomingPayoutAmount: null,
      upcomingPayoutAt: null,
      upcomingPayoutStatus: null,
    })),
    fetchStripeLiveTodayMetrics: vi.fn(async () => disconnected),
    fetchStripeLiveCumulativeMetrics: vi.fn(async () => disconnected),
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

vi.mock("@/lib/openai", () => ({
  isOpenAIConfigured: () => false,
  createAtlasResponse: vi.fn(),
}));

function baseFacts(overrides: Partial<AssistantFacts> = {}): AssistantFacts {
  const emptyMetrics = {
    apiCostUsd: 0,
    visionRequests: 0,
    visionCostUsd: 0,
    imageGenCostUsd: 0,
    imageGenRequests: 0,
    totalRequests: 0,
    inputTokens: 0,
    outputTokens: 0,
    avgOutputTokens: 0,
    errorRatePercent: 0,
    revenueJpy: null,
    activeUsers: 0,
    generationCount: 0,
  };
  return {
    period: "month",
    nowIso: new Date().toISOString(),
    current: { ...emptyMetrics },
    previous: { ...emptyMetrics },
    mrrJpy: 0,
    arrJpy: 0,
    paidUsers: 0,
    freeUsers: 0,
    churnRatePercent: null,
    arpuJpy: null,
    ltvJpy: null,
    marginPercent: null,
    profitJpy: null,
    hqUsageSharePercent: null,
    topDeliverable: null,
    highestMarginDeliverable: null,
    risingCostDeliverable: null,
    planBreakdown: [],
    qualityRows: [],
    growthRateMonthly: null,
    userGrowthRateMonthly: null,
    usdJpyRate: 150,
    dataNotes: [],
    ...overrides,
  };
}

describe("owner AI assistant analytics", () => {
  beforeEach(() => {
    resetUsageStore();
    resetSubscriptionStore();
    resetAssistantAiCacheForTests();
    vi.stubEnv("ATLAS_USD_JPY_RATE", "150");
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects API cost spikes from real period deltas", () => {
    const anomalies = detectCostAnomalies(
      baseFacts({
        current: {
          ...baseFacts().current,
          apiCostUsd: 13,
        },
        previous: {
          ...baseFacts().previous,
          apiCostUsd: 10,
        },
      }),
    );
    expect(anomalies.some((a) => a.category === "api_cost")).toBe(true);
    expect(anomalies.find((a) => a.category === "api_cost")?.severity).toBe(
      "danger",
    );
  });

  it("marks high-quality 10 runs on light plan as deficit with HQ token assumptions", () => {
    const hqCost = estimateHqRunJpy(150);
    expect(hqCost).toBeGreaterThan(90);
    const rows = buildHqSimulations(
      baseFacts({
        usdJpyRate: 150,
      }),
    );
    const light5 = rows.find(
      (row) => row.planId === "light" && row.hqRuns === 5,
    );
    const light10 = rows.find(
      (row) => row.planId === "light" && row.hqRuns === 10,
    );
    expect(light5?.isDeficit).toBe(false);
    expect(light10?.isDeficit).toBe(true);
    expect(light10!.estimatedApiCostJpy).toBe(hqCost * 10);
  });

  it("builds assistant snapshot without inventing stripe cash or calling AI", async () => {
    recordUserAiUsage({
      userId: "user_a",
      api: "responses",
      feature: "blog",
      model: "gpt-5.5",
      inputTokens: 800,
      outputTokens: 400,
      estimatedCostUsd: 0.2,
    });

    const { getAiAssistantSnapshot } = await import("./service");
    const snapshot = await getAiAssistantSnapshot({
      period: "month",
      refreshAi: false,
    });

    expect(snapshot.summary.source).toBe("rules");
    expect(snapshot.summary.aiAvailable).toBe(false);
    expect(snapshot.profitInsights.length).toBeGreaterThan(0);
    expect(snapshot.suggestions.length).toBeGreaterThan(0);
    expect(snapshot.forecasts).toHaveLength(4);
    // No dummy enterprise economics
    const enterprise = snapshot.planProposals.find(
      (p) => p.planId === "enterprise",
    );
    expect(enterprise?.estimatedMarginPercent).toBeNull();
  });
});

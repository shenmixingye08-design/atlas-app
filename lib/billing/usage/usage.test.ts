import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => {
    if (userId.startsWith("owner_")) return "owner@atlas.test";
    return `${userId}@example.com`;
  }),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: (email: string | null | undefined) =>
    Boolean(email?.endsWith("@atlas.test") && email.startsWith("owner@")),
}));

describe("AI usage metering and plan limits", () => {
  beforeEach(async () => {
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test");
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    const { resetUsageStore } = await import("@/lib/billing/usage/store");
    resetSubscriptionStore();
    resetUsageStore();
  });

  async function setPlan(
    userId: string,
    planId: "free" | "light" | "standard" | "premium",
  ) {
    const { applySubscriptionFromStripe } = await import(
      "@/lib/billing/subscriptions/service"
    );
    applySubscriptionFromStripe({
      userId,
      stripeCustomerId: `cus_${userId}`,
      stripeSubscriptionId: `sub_${userId}`,
      planId,
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  }

  it("records tokens, cost, model, api, user, and plan", async () => {
    const { recordUserAiUsage } = await import("@/lib/billing/usage/meter");
    const { getUserUsageLimitSummary } = await import(
      "@/lib/billing/usage/service"
    );
    await setPlan("user_meter", "standard");

    const event = recordUserAiUsage({
      userId: "user_meter",
      api: "responses",
      feature: "content_writing",
      model: "gpt-test",
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.0123,
    });

    expect(event.userId).toBe("user_meter");
    expect(event.planId).toBe("standard");
    expect(event.model).toBe("gpt-test");
    expect(event.api).toBe("responses");
    expect(event.inputTokens).toBe(100);
    expect(event.outputTokens).toBe(50);
    expect(event.totalTokens).toBe(150);
    expect(event.estimatedCostUsd).toBe(0.0123);
    expect(event.timestamp).toBeTruthy();

    const summary = getUserUsageLimitSummary("user_meter");
    expect(summary.aiRuns.used).toBe(1);
    expect(summary.aiDetail.today.requests).toBe(1);
    expect(summary.aiDetail.month.totalTokens).toBe(150);
    expect(summary.aiDetail.allTime.estimatedCostUsd).toBe(0.0123);
    expect(summary.aiDetail.byModel["gpt-test"]?.requests).toBe(1);
    expect(summary.aiDetail.byFeature.content_writing?.requests).toBe(1);
  });

  it("enforces Free plan AI monthly limit with 429", async () => {
    const { recordUserAiUsage } = await import("@/lib/billing/usage/meter");
    const { evaluateBillingAiUsage } = await import("@/lib/billing/access");
    const { getPlanDefinition } = await import("@/lib/billing/plans/registry");
    await setPlan("user_free", "free");
    const limit = getPlanDefinition("free").limits.aiUsageMonthly;

    for (let i = 0; i < limit - 1; i += 1) {
      recordUserAiUsage({
        userId: "user_free",
        api: "orchestrate",
        feature: "content_writing",
        model: "gpt-test",
        inputTokens: 10,
        outputTokens: 5,
      });
    }

    expect((await evaluateBillingAiUsage("user_free")).denial).toBeNull();

    recordUserAiUsage({
      userId: "user_free",
      api: "orchestrate",
      feature: "content_writing",
      model: "gpt-test",
      inputTokens: 1,
      outputTokens: 1,
    });

    const { denial } = await evaluateBillingAiUsage("user_free");
    expect(denial?.status).toBe(429);
    expect(denial?.kind).toBe("limit");
    expect(denial?.reason).toContain("上限");
  });

  it("allows Light users within 120 AI runs", async () => {
    const { recordUserAiUsage } = await import("@/lib/billing/usage/meter");
    const { evaluateBillingAiUsage } = await import("@/lib/billing/access");
    const { getPlanDefinition } = await import("@/lib/billing/plans/registry");
    await setPlan("user_light", "light");
    const limit = getPlanDefinition("light").limits.aiUsageMonthly;

    recordUserAiUsage({
      userId: "user_light",
      api: "commander",
      feature: "content_writing",
      model: "gpt-test",
      inputTokens: 20,
      outputTokens: 10,
      requestCount: limit - 1,
    });

    expect((await evaluateBillingAiUsage("user_light")).denial).toBeNull();

    recordUserAiUsage({
      userId: "user_light",
      api: "commander",
      feature: "content_writing",
      model: "gpt-test",
      inputTokens: 1,
      outputTokens: 1,
    });
    expect((await evaluateBillingAiUsage("user_light")).denial?.status).toBe(
      429,
    );
  });

  it("allows Standard users within 400 AI runs", async () => {
    const { recordUserAiUsage } = await import("@/lib/billing/usage/meter");
    const { evaluateBillingAiUsage } = await import("@/lib/billing/access");
    const { getPlanDefinition } = await import("@/lib/billing/plans/registry");
    await setPlan("user_std", "standard");
    const limit = getPlanDefinition("standard").limits.aiUsageMonthly;

    recordUserAiUsage({
      userId: "user_std",
      api: "automation",
      feature: "content_writing",
      model: "gpt-test",
      inputTokens: 5,
      outputTokens: 5,
      requestCount: limit,
    });
    expect((await evaluateBillingAiUsage("user_std")).denial?.status).toBe(429);
  });

  it("allows Premium users within 2000 AI runs", async () => {
    const { recordUserAiUsage } = await import("@/lib/billing/usage/meter");
    const { evaluateBillingAiUsage } = await import("@/lib/billing/access");
    const { getPlanDefinition } = await import("@/lib/billing/plans/registry");
    await setPlan("user_prem", "premium");
    const limit = getPlanDefinition("premium").limits.aiUsageMonthly;

    recordUserAiUsage({
      userId: "user_prem",
      api: "google_drive",
      feature: "google_integration",
      model: "gpt-test",
      inputTokens: 5,
      outputTokens: 5,
      requestCount: limit - 1,
    });
    expect((await evaluateBillingAiUsage("user_prem")).denial).toBeNull();
  });

  it("lets owners bypass AI usage limits while still recording usage", async () => {
    const { recordUserAiUsage } = await import("@/lib/billing/usage/meter");
    const { evaluateBillingAiUsage } = await import("@/lib/billing/access");
    const { getPlanDefinition } = await import("@/lib/billing/plans/registry");
    await setPlan("owner_admin", "free");
    const limit = getPlanDefinition("free").limits.aiUsageMonthly;

    recordUserAiUsage({
      userId: "owner_admin",
      api: "responses",
      feature: "content_writing",
      model: "gpt-test",
      inputTokens: 8,
      outputTokens: 4,
      requestCount: limit + 5,
    });

    expect((await evaluateBillingAiUsage("owner_admin")).denial).toBeNull();
    const { getUserUsageLimitSummary } = await import(
      "@/lib/billing/usage/service"
    );
    expect(getUserUsageLimitSummary("owner_admin").aiRuns.used).toBe(limit + 5);
  });

  it("reuses incrementUsageCounter for aiRuns quota", async () => {
    const { incrementUsageCounter, getUsageSnapshot } = await import(
      "@/lib/billing/usage/store"
    );
    const { evaluateAiUsageAccess } = await import("@/lib/billing/policy");
    await setPlan("user_counter", "free");

    incrementUsageCounter("user_counter", "aiRuns", 20);
    expect(getUsageSnapshot("user_counter").aiRuns).toBe(20);
    expect(evaluateAiUsageAccess("user_counter").allowed).toBe(false);
  });
});

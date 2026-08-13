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

import {
  MODEL_CATALOG,
  MODEL_PRICING_TABLE_UPDATED_AT,
  MODEL_PRICING_TABLE_VERSION,
  estimateTokenCostUsd,
} from "@/lib/ai/model-catalog";
import { getPlanDefinition, listPlanDefinitions } from "@/lib/billing/plans/registry";
import { AI_USAGE_LIMIT_REACHED_MESSAGE } from "@/lib/billing/plans/policy";
import { tweetContainsExternalUrl } from "@/lib/billing/usage/x-url";
import {
  incrementUsageCounterOnce,
  resetUsageStore,
} from "@/lib/billing/usage/store";
import {
  recordWordPressPublishUsageOnce,
  recordXPostUsageOnce,
} from "@/lib/billing/usage/external-counters";
import { recordUserAiUsage } from "@/lib/billing/usage/meter";
import { getUserUsageLimitSummary } from "@/lib/billing/usage/service";
import {
  simulatePaidPlanProfitSafety,
  USD_JPY_SAFETY_RATE,
} from "@/lib/owner/profit-simulator/plan-safety";

describe("profit-safe plan registry SoT", () => {
  it("keeps paid prices at 980 / 2980 / 9800 and never calls Premium unlimited", () => {
    expect(getPlanDefinition("light").monthlyPriceJpy).toBe(980);
    expect(getPlanDefinition("standard").monthlyPriceJpy).toBe(2980);
    expect(getPlanDefinition("premium").monthlyPriceJpy).toBe(9800);
    expect(getPlanDefinition("free").monthlyPriceJpy).toBe(0);

    const blob = listPlanDefinitions()
      .flatMap((plan) => [plan.description, ...plan.highlights, ...(plan.notes ?? [])])
      .join("\n");
    expect(blob).not.toContain("無制限");
  });

  it("matches Free experience: 1 AI completion, no automations or paid posting", () => {
    const free = getPlanDefinition("free").limits;
    expect(free.aiUsageMonthly).toBe(1);
    expect(free.automationTasks).toBe(0);
    expect(free.externalIntegrations).toBe(0);
    expect(free.xAutoPostsMonthly).toBe(0);
    expect(free.xUrlPostsMonthly).toBe(0);
    expect(free.wordpressPostsMonthly).toBe(0);
    expect(free.snsPostsMonthly).toBe(0);
    expect(getPlanDefinition("free").highlights.some((item) => item.includes("1件完成"))).toBe(
      true,
    );
  });

  it("matches Light / Standard / Premium limits from the profit-safe table", () => {
    const light = getPlanDefinition("light").limits;
    expect(light).toMatchObject({
      aiUsageMonthly: 30,
      aiCostBudgetUsdMonthly: 1.5,
      externalIntegrations: 1,
      automationTasks: 3,
      xAutoPostsMonthly: 0,
      xUrlPostsMonthly: 0,
      wordpressPostsMonthly: 0,
      highQualityMode: false,
    });
    expect(light.features).toContain("sns_assist");
    expect(light.features).not.toContain("sns_auto_post");
    expect(light.features).not.toContain("blog_creation");

    const standard = getPlanDefinition("standard").limits;
    expect(standard).toMatchObject({
      aiUsageMonthly: 100,
      aiCostBudgetUsdMonthly: 5,
      externalIntegrations: 3,
      automationTasks: 10,
      xAutoPostsMonthly: 30,
      xUrlPostsMonthly: 10,
      wordpressPostsMonthly: 8,
      highQualityMode: false,
    });
    expect(standard.features).toContain("sns_auto_post");
    expect(standard.features).toContain("blog_creation");

    const premium = getPlanDefinition("premium").limits;
    expect(premium).toMatchObject({
      aiUsageMonthly: 300,
      aiCostBudgetUsdMonthly: 15,
      externalIntegrations: 10,
      automationTasks: 50,
      xAutoPostsMonthly: 150,
      xUrlPostsMonthly: 30,
      wordpressPostsMonthly: 30,
      highQualityMode: true,
    });
    expect(premium.features).toContain("advanced_automation");
    expect(premium.features).toContain("high_quality_mode");
    expect(premium.features).toContain("priority_processing");
  });

  it("keeps snsPostsMonthly aliased to xAutoPostsMonthly", () => {
    for (const plan of listPlanDefinitions()) {
      expect(plan.limits.snsPostsMonthly).toBe(plan.limits.xAutoPostsMonthly);
    }
  });
});

describe("OpenAI pricing catalog SoT", () => {
  it("uses official GPT-5.5 and GPT-5 mini unit prices", () => {
    expect(MODEL_CATALOG.strong).toMatchObject({
      model: "gpt-5.5",
      inputPricePerMillion: 5,
      cachedInputPricePerMillion: 0.5,
      outputPricePerMillion: 30,
    });
    expect(MODEL_CATALOG.cheap).toMatchObject({
      model: "gpt-5-mini",
      inputPricePerMillion: 0.25,
      cachedInputPricePerMillion: 0.025,
      outputPricePerMillion: 2,
    });
    expect(MODEL_PRICING_TABLE_VERSION).toBe("2026-08-openai-gpt55-v2");
    expect(MODEL_PRICING_TABLE_UPDATED_AT).toContain("2026-08-13");
    expect(
      estimateTokenCostUsd({
        model: "gpt-5.5",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(35);
    expect(
      estimateTokenCostUsd({
        model: "gpt-5-mini",
        inputTokens: 1_000_000,
        outputTokens: 0,
        cached: true,
      }),
    ).toBe(0.025);
  });
});

describe("profit-safe cost guards and posting quotas", () => {
  beforeEach(async () => {
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test");
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    resetSubscriptionStore();
    resetUsageStore();
  });

  async function setPlan(
    userId: string,
    planId: "free" | "light" | "standard" | "premium",
    status: "active" | "canceled" | "past_due" | "trialing" = "active",
  ) {
    const { applySubscriptionFromStripe } = await import(
      "@/lib/billing/subscriptions/service"
    );
    await applySubscriptionFromStripe({
      userId,
      stripeCustomerId: `cus_${userId}`,
      stripeSubscriptionId: `sub_${userId}`,
      planId,
      status,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  }

  it("Light: AI 30 allowed, 31st blocked, cost $1.50 blocked, X and WP blocked", async () => {
    const { evaluateBillingAiUsage, evaluateBillingSnsPost, evaluateBillingWordPressPublish } =
      await import("@/lib/billing/access");
    await setPlan("user_light_guard", "light");

    recordUserAiUsage({
      userId: "user_light_guard",
      api: "commander",
      feature: "content_writing",
      model: "gpt-5-mini",
      inputTokens: 1,
      outputTokens: 1,
      requestCount: 30,
      estimatedCostUsd: 0.01,
    });
    expect((await evaluateBillingAiUsage("user_light_guard")).denial?.status).toBe(
      429,
    );
    expect((await evaluateBillingAiUsage("user_light_guard")).denial?.reason).toBe(
      AI_USAGE_LIMIT_REACHED_MESSAGE,
    );

    resetUsageStore();
    await setPlan("user_light_cost", "light");
    recordUserAiUsage({
      userId: "user_light_cost",
      api: "commander",
      feature: "content_writing",
      model: "gpt-5.5",
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: 1.5,
    });
    const costDenial = (await evaluateBillingAiUsage("user_light_cost")).denial;
    expect(costDenial?.status).toBe(429);
    expect(costDenial?.reason).toBe(AI_USAGE_LIMIT_REACHED_MESSAGE);
    expect(costDenial?.reason).not.toContain("$");

    expect(
      (await evaluateBillingSnsPost("user_light_guard", { text: "hello" })).denial
        ?.requiredPlan,
    ).toBe("standard");
    expect(
      (await evaluateBillingWordPressPublish("user_light_guard")).denial?.requiredPlan,
    ).toBe("standard");
  });

  it("Standard: AI 100, budget $5, X 30, URL 10, WordPress 8", async () => {
    const { evaluateBillingAiUsage, evaluateBillingSnsPost, evaluateBillingWordPressPublish } =
      await import("@/lib/billing/access");
    const { incrementUsageCounter } = await import("@/lib/billing/usage/store");
    await setPlan("user_std_guard", "standard");

    recordUserAiUsage({
      userId: "user_std_guard",
      api: "automation",
      feature: "content_writing",
      model: "gpt-5-mini",
      inputTokens: 1,
      outputTokens: 1,
      requestCount: 100,
      estimatedCostUsd: 0.01,
    });
    expect((await evaluateBillingAiUsage("user_std_guard")).denial?.status).toBe(429);

    resetUsageStore();
    await setPlan("user_std_budget", "standard");
    recordUserAiUsage({
      userId: "user_std_budget",
      api: "automation",
      feature: "content_writing",
      model: "gpt-5.5",
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: 5,
    });
    expect((await evaluateBillingAiUsage("user_std_budget")).denial?.status).toBe(429);

    await setPlan("user_std_x", "standard");
    incrementUsageCounter("user_std_x", "snsPosts", 30);
    expect((await evaluateBillingSnsPost("user_std_x", { text: "hello" })).denial?.status).toBe(
      429,
    );

    resetUsageStore();
    await setPlan("user_std_url", "standard");
    incrementUsageCounter("user_std_url", "xUrlPosts", 10);
    expect(
      (await evaluateBillingSnsPost("user_std_url", { text: "see https://example.com" }))
        .denial?.status,
    ).toBe(429);
    expect(
      (await evaluateBillingSnsPost("user_std_url", { text: "no link" })).denial,
    ).toBeNull();

    resetUsageStore();
    await setPlan("user_std_wp", "standard");
    incrementUsageCounter("user_std_wp", "wordpressPosts", 8);
    expect((await evaluateBillingWordPressPublish("user_std_wp")).denial?.status).toBe(
      429,
    );
  });

  it("Premium: AI 300, budget $15, X 150, URL 30, WordPress 30", async () => {
    const { evaluateBillingAiUsage, evaluateBillingSnsPost, evaluateBillingWordPressPublish } =
      await import("@/lib/billing/access");
    const { incrementUsageCounter } = await import("@/lib/billing/usage/store");
    await setPlan("user_prem_guard", "premium");

    recordUserAiUsage({
      userId: "user_prem_guard",
      api: "commander",
      feature: "content_writing",
      model: "gpt-5-mini",
      inputTokens: 1,
      outputTokens: 1,
      requestCount: 299,
      estimatedCostUsd: 0.01,
    });
    expect((await evaluateBillingAiUsage("user_prem_guard")).denial).toBeNull();
    recordUserAiUsage({
      userId: "user_prem_guard",
      api: "commander",
      feature: "content_writing",
      model: "gpt-5-mini",
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: 0.01,
    });
    expect((await evaluateBillingAiUsage("user_prem_guard")).denial?.status).toBe(429);

    resetUsageStore();
    await setPlan("user_prem_budget", "premium");
    recordUserAiUsage({
      userId: "user_prem_budget",
      api: "commander",
      feature: "content_writing",
      model: "gpt-5.5",
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostUsd: 15,
    });
    expect((await evaluateBillingAiUsage("user_prem_budget")).denial?.status).toBe(429);

    await setPlan("user_prem_x", "premium");
    incrementUsageCounter("user_prem_x", "snsPosts", 150);
    expect((await evaluateBillingSnsPost("user_prem_x", { text: "hello" })).denial?.status).toBe(
      429,
    );

    resetUsageStore();
    await setPlan("user_prem_url", "premium");
    incrementUsageCounter("user_prem_url", "xUrlPosts", 30);
    expect(
      (await evaluateBillingSnsPost("user_prem_url", {
        text: "https://example.com",
      })).denial?.status,
    ).toBe(429);

    resetUsageStore();
    await setPlan("user_prem_wp", "premium");
    incrementUsageCounter("user_prem_wp", "wordpressPosts", 30);
    expect((await evaluateBillingWordPressPublish("user_prem_wp")).denial?.status).toBe(
      429,
    );
  });

  it("does not double-count X or WordPress usage on retry of the same provider id", () => {
    recordXPostUsageOnce({
      userId: "user_retry",
      tweetId: "tw_1",
      text: "hello https://example.com",
    });
    recordXPostUsageOnce({
      userId: "user_retry",
      tweetId: "tw_1",
      text: "hello https://example.com",
    });
    const xOnce = incrementUsageCounterOnce("user_retry", "snsPosts", "x:tw_1");
    expect(xOnce.incremented).toBe(false);

    recordWordPressPublishUsageOnce({ userId: "user_retry", postId: 99 });
    recordWordPressPublishUsageOnce({ userId: "user_retry", postId: 99 });

    const summary = getUserUsageLimitSummary("user_retry");
    expect(summary.snsPosts.used).toBe(1);
    expect(summary.xUrlPosts.used).toBe(1);
    expect(summary.wordpressPosts.used).toBe(1);
  });

  it("re-gates X on Standard → Light downgrade without deleting automations", async () => {
    const { evaluateBillingSnsPost, evaluateBillingFeature } = await import(
      "@/lib/billing/access"
    );
    await setPlan("user_down", "standard");
    expect((await evaluateBillingFeature("user_down", "sns_auto_post")).denial).toBeNull();

    await setPlan("user_down", "light");
    expect(
      (await evaluateBillingSnsPost("user_down", { text: "still scheduled" })).denial
        ?.requiredPlan,
    ).toBe("standard");
    expect(
      (await evaluateBillingFeature("user_down", "sns_auto_post")).denial?.requiredPlan,
    ).toBe("standard");
  });

  it("falls back to Free entitlements after cancellation", async () => {
    const { evaluateBillingFeature, evaluateBillingSnsPost, evaluateBillingWordPressPublish } =
      await import("@/lib/billing/access");
    await setPlan("user_cancel", "standard", "canceled");
    expect(
      (await evaluateBillingFeature("user_cancel", "sns_auto_post")).denial,
    ).not.toBeNull();
    expect(
      (await evaluateBillingSnsPost("user_cancel", { text: "hello" })).denial,
    ).not.toBeNull();
    expect((await evaluateBillingWordPressPublish("user_cancel")).denial).not.toBeNull();
    expect(getUserUsageLimitSummary("user_cancel").planId).toBe("free");
  });

  it("detects external URLs in tweet text", () => {
    expect(tweetContainsExternalUrl("hello")).toBe(false);
    expect(tweetContainsExternalUrl("see https://example.com/a")).toBe(true);
    expect(tweetContainsExternalUrl("www.example.com")).toBe(true);
  });
});

describe("profit-safety simulator", () => {
  it("matches the safety envelope and keeps contribution margin positive", () => {
    expect(USD_JPY_SAFETY_RATE).toBe(170);
    const rows = simulatePaidPlanProfitSafety();
    const byId = Object.fromEntries(rows.map((row) => [row.planId, row]));

    expect(byId.light.maxDirectVariableCostJpy).toBe(290);
    expect(byId.standard.maxDirectVariableCostJpy).toBe(1348);
    expect(byId.premium.maxDirectVariableCostJpy).toBe(4229);

    for (const row of rows) {
      expect(row.contributionMarginPositive).toBe(true);
      expect(row.contributionMarginJpy).toBeGreaterThan(0);
    }
  });
});

describe("Stripe price mapping (no live charges)", () => {
  it("expects registry JPY amounts and fails only on live mismatch", async () => {
    const { getExpectedStripeAmountJpy } = await import(
      "@/lib/billing/plans/registry"
    );
    expect(getExpectedStripeAmountJpy("light")).toBe(980);
    expect(getExpectedStripeAmountJpy("standard")).toBe(2980);
    expect(getExpectedStripeAmountJpy("premium")).toBe(9800);

    const { verifyStripePriceAmountsAgainstRegistry } = await import(
      "@/lib/billing/stripe/price-amount-guard"
    );
    const report = await verifyStripePriceAmountsAgainstRegistry();
    if (report.liveVerified) {
      expect(report.ok, JSON.stringify(report.checks, null, 2)).toBe(true);
    } else {
      expect(report.ok).toBe(true);
    }
  });
});

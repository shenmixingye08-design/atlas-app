/**
 * Phase 1 product focus: Light can finish daily X auto-post.
 * Covers entitlement A–I plus LP / Home / Pricing display alignment.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => null,
}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => `${userId}@example.com`),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: () => false,
}));

import { HOME_AUTOMATION_HREF } from "@/components/automation-first/home-primary-actions";
import { evaluateBillingFeature } from "./access/snapshot";
import { getUserBillingSummary } from "./service";
import { getLandingPlans } from "@/lib/landing/content";
import { LIGHT_PLAN_JPY } from "@/lib/landing/pay-reason";
import {
  HOME_X_AUTOMATION_HREF,
  LIGHT_RESULT_LINE,
  PRODUCT_DEFINITION,
  PRODUCT_HERO_PROMISE,
  PRODUCT_PRIMARY_USE_CASE,
} from "@/lib/product-focus/messaging";
import {
  checkAutomationTaskLimit,
  checkExternalIntegrationLimit,
  checkFeatureAccess,
  checkSnsPostLimit,
  getPlanDefinition,
  listPlanDefinitions,
  type PlanId,
} from "./plans";
import { resolveMinimumOfferedPlanForFeature } from "./plans/offered-capabilities";
import { handleStripeWebhookEvent } from "./stripe/webhook-handlers";
import { incrementUsageCounter, resetUsageStore } from "./usage/store";
import { resetAiQuotaEngineForTests } from "./usage/quota-engine";
import { getUserUsageLimitSummary } from "./usage/service";
import { resetSubscriptionStore } from "./subscriptions/store";
import { resetBillingHistoryStore } from "./history/store";
import { resetBillingNotificationStore } from "./notifications/store";
import { resetProcessedStripeEvents } from "./stripe/webhook-idempotency";
import { evaluateBillingSnsPost } from "./access/snapshot";
import { evaluateExternalServiceConnectAccess } from "@/lib/integrations/external-services/connect-access";
import { resetExternalAuthHydration } from "@/lib/integrations/external-services/durable";
import { resetExternalServiceStore } from "@/lib/integrations/external-services/store";

const PRICE = {
  light: "price_phase1_light",
  standard: "price_phase1_standard",
  premium: "price_phase1_premium",
} as const;

function usage(snsPosts: number) {
  return {
    userId: "user_phase1",
    month: "2026-08",
    updatedAt: "2026-08-22T00:00:00.000Z",
    aiRuns: 0,
    snsPosts,
    xUrlPosts: 0,
    wordpressPosts: 0,
    automationTasksActive: 0,
  } as const;
}

function buildEvent<T extends string>(
  type: T,
  object: Record<string, unknown>,
  id = `evt_${type}_${Math.random().toString(36).slice(2, 8)}`,
): Parameters<typeof handleStripeWebhookEvent>[0] {
  return {
    id,
    type,
    data: { object },
  };
}

async function checkoutPaid(
  userId: string,
  planId: "light" | "standard" | "premium",
) {
  return handleStripeWebhookEvent(
    buildEvent("checkout.session.completed", {
      client_reference_id: userId,
      customer: `cus_${userId}`,
      subscription: `sub_${userId}`,
      metadata: {
        userId,
        planId,
        priceId: PRICE[planId],
      },
    }),
  );
}

describe("Phase 1 X Light product focus", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STRIPE_PRICE_LIGHT", PRICE.light);
    vi.stubEnv("STRIPE_PRICE_STANDARD", PRICE.standard);
    vi.stubEnv("STRIPE_PRICE_PREMIUM", PRICE.premium);
    resetSubscriptionStore();
    resetBillingHistoryStore();
    resetBillingNotificationStore();
    resetProcessedStripeEvents();
    resetUsageStore();
    resetAiQuotaEngineForTests();
    resetExternalServiceStore();
    resetExternalAuthHydration();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("A: Light can connect X", async () => {
    await checkoutPaid("user_phase1_a", "light");
    expect(
      (await evaluateExternalServiceConnectAccess("user_phase1_a", "x")).denial,
    ).toBeNull();
    expect(getPlanDefinition("light").limits.externalIntegrations).toBe(1);
  });

  it("B: Light can create X auto-post", async () => {
    await checkoutPaid("user_phase1_b", "light");
    expect(
      (await evaluateBillingFeature("user_phase1_b", "sns_auto_post")).denial,
    ).toBeNull();
    expect(checkFeatureAccess("light", "sns_auto_post").allowed).toBe(true);
    expect(checkAutomationTaskLimit("light", 0).allowed).toBe(true);
  });

  it("C/D/F: Light allows 30 X posts and server-denies the 31st, including API gates", async () => {
    await checkoutPaid("user_phase1_cd", "light");
    expect(checkSnsPostLimit("light", usage(29)).allowed).toBe(true);
    expect(checkSnsPostLimit("light", usage(30)).allowed).toBe(false);
    expect(
      (await evaluateBillingSnsPost("user_phase1_cd", { text: "hello" })).denial,
    ).toBeNull();
    incrementUsageCounter("user_phase1_cd", "snsPosts", 30);
    const denied = await evaluateBillingSnsPost("user_phase1_cd", {
      text: "31st",
    });
    expect(denied.denial?.status).toBe(429);
    expect(denied.denial?.reason).toContain("30");
    expect(getUserUsageLimitSummary("user_phase1_cd").snsPosts.limit).toBe(30);
  });

  it("E/F: Free trial caps are enforced on the same server gates as the UI", async () => {
    expect(checkFeatureAccess("free", "sns_auto_post").allowed).toBe(true);
    expect(checkExternalIntegrationLimit("free", 0).allowed).toBe(true);
    expect(checkExternalIntegrationLimit("free", 1).allowed).toBe(false);
    expect(checkAutomationTaskLimit("free", 0).allowed).toBe(true);
    expect(checkAutomationTaskLimit("free", 1).allowed).toBe(false);
    expect(checkSnsPostLimit("free", usage(0)).allowed).toBe(true);
    expect(checkSnsPostLimit("free", usage(1)).allowed).toBe(false);
    expect(
      (await evaluateExternalServiceConnectAccess("user_phase1_e", "x")).denial,
    ).toBeNull();
    incrementUsageCounter("user_phase1_e", "snsPosts", 1);
    expect(
      (await evaluateBillingSnsPost("user_phase1_e", { text: "second" })).denial
        ?.status,
    ).toBe(429);
    expect(checkFeatureAccess("free", "google_integration").allowed).toBe(false);
  });

  it("G: Standard and Premium stay strictly above Light", () => {
    const light = getPlanDefinition("light").limits;
    const standard = getPlanDefinition("standard").limits;
    const premium = getPlanDefinition("premium").limits;
    expect(standard.aiUsageMonthly).toBeGreaterThan(light.aiUsageMonthly);
    expect(standard.automationTasks).toBeGreaterThan(light.automationTasks);
    expect(standard.externalIntegrations).toBeGreaterThan(
      light.externalIntegrations,
    );
    expect(standard.xAutoPostsMonthly).toBeGreaterThanOrEqual(
      light.xAutoPostsMonthly,
    );
    expect(standard.xUrlPostsMonthly).toBeGreaterThan(light.xUrlPostsMonthly);
    expect(standard.wordpressPostsMonthly).toBeGreaterThan(
      light.wordpressPostsMonthly,
    );
    expect(standard.features).toContain("google_integration");
    expect(light.features).not.toContain("google_integration");
    expect(premium.aiUsageMonthly).toBeGreaterThan(standard.aiUsageMonthly);
    expect(premium.xAutoPostsMonthly).toBeGreaterThan(standard.xAutoPostsMonthly);
    expect(premium.automationTasks).toBeGreaterThan(standard.automationTasks);
    expect(premium.externalIntegrations).toBeGreaterThan(
      standard.externalIntegrations,
    );
  });

  it("H: Billing summary matches Plan Registry after Light checkout", async () => {
    await checkoutPaid("user_phase1_h", "light");
    const plan = getPlanDefinition("light");
    const summary = await getUserBillingSummary("user_phase1_h");
    expect(summary.effectivePlanId).toBe("light");
    expect(summary.plan.monthlyPriceJpy).toBe(plan.monthlyPriceJpy);
    expect(summary.plan.highlights).toEqual(plan.highlights);
    expect(summary.usage.aiRuns.limit).toBe(plan.limits.aiUsageMonthly);
    expect(summary.usage.automationTasks.limit).toBe(plan.limits.automationTasks);
    expect(summary.usage.snsPosts.limit).toBe(plan.limits.xAutoPostsMonthly);
    expect(LIGHT_PLAN_JPY).toBe(980);
    expect(plan.monthlyPriceJpy).toBe(980);
  });

  it("I: LP pricing cards match Registry entitlements and result-first Light copy", () => {
    const landing = getLandingPlans();
    for (const plan of listPlanDefinitions()) {
      const card = landing.find((row) => row.planId === plan.planId);
      expect(card?.monthlyPriceJpy).toBe(plan.monthlyPriceJpy);
      expect(card?.description).toBe(plan.description);
      expect(card?.highlights).toEqual(plan.highlights);
      expect(card?.limits.xAutoPostsMonthly).toBe(plan.limits.xAutoPostsMonthly);
      expect(card?.limits.features).toEqual(plan.limits.features);
    }
    expect(getPlanDefinition("light").description).toBe(LIGHT_RESULT_LINE);
    expect(
      getPlanDefinition("light").highlights.some((item) =>
        item.includes("X自動投稿 月30件"),
      ),
    ).toBe(true);
    expect(resolveMinimumOfferedPlanForFeature("sns_auto_post")).toBe("free");
  });

  it("keeps Stripe yen amounts unchanged", () => {
    const yen: Record<PlanId, number> = {
      free: 0,
      light: 980,
      standard: 2980,
      premium: 9800,
    };
    for (const plan of listPlanDefinitions()) {
      expect(plan.monthlyPriceJpy).toBe(yen[plan.planId]);
    }
  });

  it("unifies LP / Home / Pricing around daily X auto-post", () => {
    const hero = readFileSync(
      join(process.cwd(), "components/landing/landing-hero-section.tsx"),
      "utf8",
    );
    const home = readFileSync(
      join(process.cwd(), "components/automation-first/home-primary-actions.tsx"),
      "utf8",
    );
    const pricing = readFileSync(
      join(process.cwd(), "components/landing/landing-page.tsx"),
      "utf8",
    );
    expect(hero).toContain(PRODUCT_HERO_PROMISE.split("、")[0]);
    expect(hero).toContain("一度頼めばあとは確認するだけ");
    expect(hero).toContain(PRODUCT_DEFINITION);
    expect(home).toContain("HOME_X_AUTOMATION_CTA");
    expect(home).toContain("HOME_OTHER_WORK_CTA");
    expect(HOME_AUTOMATION_HREF).toBe(HOME_X_AUTOMATION_HREF);
    expect(pricing).toContain("毎日のX投稿を任せたいなら Light");
    expect(PRODUCT_PRIMARY_USE_CASE).toBe("毎日のX投稿");
  });
});

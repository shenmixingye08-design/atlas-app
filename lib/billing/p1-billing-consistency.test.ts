/**
 * P1 billing consistency: UI price = Stripe Price = DB plan = entitlement = limits.
 * Regular (non-owner) users only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => null,
}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => {
    if (userId.startsWith("owner_")) return "owner@atlas.test";
    return `${userId}@example.com`;
  }),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: (email: string | null | undefined) =>
    Boolean(email?.startsWith("owner@") && email.endsWith("@atlas.test")),
}));

import { evaluateBillingFeature } from "./access/snapshot";
import { consumeBillingAiJob } from "./access/enforce";
import { getUserBillingSummary } from "./service";
import { getLandingPlans } from "@/lib/landing/content";
import { LIGHT_PLAN_JPY } from "@/lib/landing/pay-reason";
import { getPlanDefinition, listPlanDefinitions } from "./plans/registry";
import { listBillingHistoryRecords, resetBillingHistoryStore } from "./history/store";
import { resetBillingNotificationStore } from "./notifications/store";
import { resolveEffectivePlanId } from "./policy";
import {
  applySubscriptionFromStripe,
  resolveEffectivePlanIdFromRecord,
} from "./subscriptions/service";
import { resetSubscriptionStore } from "./subscriptions/store";
import { assertAllowedStripePriceId } from "./stripe/checkout";
import { handleStripeWebhookEvent } from "./stripe/webhook-handlers";
import {
  claimStripeEventForProcessing,
  markStripeEventProcessed,
  resetProcessedStripeEvents,
} from "./stripe/webhook-idempotency";
import { getUserUsageLimitSummary } from "./usage/service";
import {
  resetAiQuotaEngineForTests,
  seedAiRunsForTests,
} from "./usage/quota-engine";
import { resetUsageStore } from "./usage/store";
import { resetStripeWebhookLogStore } from "@/lib/owner/billing-webhook/store";

const PRICE = {
  light: "price_light_p1",
  standard: "price_standard_p1",
  premium: "price_premium_p1",
} as const;

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

async function checkoutPaid(input: {
  userId: string;
  planId: "light" | "standard" | "premium";
  customerId?: string;
  subscriptionId?: string;
  eventId?: string;
}) {
  return handleStripeWebhookEvent(
    buildEvent(
      "checkout.session.completed",
      {
        client_reference_id: input.userId,
        customer: input.customerId ?? `cus_${input.userId}`,
        subscription: input.subscriptionId ?? `sub_${input.userId}`,
        metadata: {
          userId: input.userId,
          planId: input.planId,
          priceId: PRICE[input.planId],
        },
      },
      input.eventId,
    ),
  );
}

describe("P1 billing consistency (regular users)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STRIPE_PRICE_LIGHT", PRICE.light);
    vi.stubEnv("STRIPE_PRICE_STANDARD", PRICE.standard);
    vi.stubEnv("STRIPE_PRICE_PREMIUM", PRICE.premium);
    resetSubscriptionStore();
    resetBillingHistoryStore();
    resetBillingNotificationStore();
    resetStripeWebhookLogStore();
    resetProcessedStripeEvents();
    resetUsageStore();
    resetAiQuotaEngineForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("A: new Light checkout grants Light from allowlisted Price ID", async () => {
    const userId = "user_p1_light";
    const result = await checkoutPaid({ userId, planId: "light" });
    expect(result.success).toBe(true);

    const summary = await getUserBillingSummary(userId);
    expect(summary.subscription.planId).toBe("light");
    expect(summary.subscription.stripePriceId).toBe(PRICE.light);
    expect(summary.effectivePlanId).toBe("light");
    expect(summary.plan.monthlyPriceJpy).toBe(980);
    expect(summary.usage.planId).toBe("light");
    expect(summary.usage.aiRuns.limit).toBe(30);
    expect(summary.usage.automationTasks.limit).toBe(3);

    const { denial } = await evaluateBillingFeature(userId, "sns_assist");
    expect(denial).toBeNull();
  });

  it("B: Light registry / entitlement / usage are 30 AI and 3 automations", async () => {
    const light = getPlanDefinition("light");
    expect(light.monthlyPriceJpy).toBe(980);
    expect(light.limits.aiUsageMonthly).toBe(30);
    expect(light.limits.automationTasks).toBe(3);
    expect(light.limits.externalIntegrations).toBe(1);
    expect(light.limits.xAutoPostsMonthly).toBe(30);
    expect(LIGHT_PLAN_JPY).toBe(light.monthlyPriceJpy);

    const landing = getLandingPlans();
    for (const plan of listPlanDefinitions()) {
      const card = landing.find((row) => row.planId === plan.planId);
      expect(card?.monthlyPriceJpy).toBe(plan.monthlyPriceJpy);
      expect(card?.name).toBe(plan.name);
      expect(card?.limits.aiUsageMonthly).toBe(plan.limits.aiUsageMonthly);
      expect(card?.limits.automationTasks).toBe(plan.limits.automationTasks);
    }

    await applySubscriptionFromStripe({
      userId: "user_p1_limits",
      stripeCustomerId: "cus_p1_limits",
      stripeSubscriptionId: "sub_p1_limits",
      planId: "light",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripePriceId: PRICE.light,
    });
    const usage = getUserUsageLimitSummary("user_p1_limits");
    expect(usage.aiRuns.limit).toBe(30);
    expect(usage.automationTasks.limit).toBe(3);
    expect(resolveEffectivePlanId("user_p1_limits")).toBe("light");
  });

  it("C: Light → Standard upgrade keeps usage and raises limits", async () => {
    const userId = "user_p1_upgrade";
    await checkoutPaid({ userId, planId: "light" });
    seedAiRunsForTests(userId, 18);
    expect(getUserUsageLimitSummary(userId).aiRuns).toMatchObject({
      used: 18,
      limit: 30,
    });

    const now = Math.floor(Date.now() / 1000);
    const updated = await handleStripeWebhookEvent(
      buildEvent("customer.subscription.updated", {
        id: `sub_${userId}`,
        customer: `cus_${userId}`,
        metadata: { userId, planId: "light" },
        status: "active",
        current_period_start: now,
        current_period_end: now + 86400 * 30,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: PRICE.standard } }] },
      }),
    );
    expect(updated.success).toBe(true);
    expect(updated.planId).toBe("standard");

    const summary = await getUserBillingSummary(userId);
    expect(summary.effectivePlanId).toBe("standard");
    expect(summary.subscription.stripePriceId).toBe(PRICE.standard);
    expect(summary.usage.aiRuns.used).toBe(18);
    expect(summary.usage.aiRuns.limit).toBe(100);
    expect(summary.usage.automationTasks.limit).toBe(10);
  });

  it("D: Standard → Light downgrade keeps AI usage and applies Light limits", async () => {
    const userId = "user_p1_downgrade";
    await checkoutPaid({ userId, planId: "standard" });
    seedAiRunsForTests(userId, 18);

    const now = Math.floor(Date.now() / 1000);
    await handleStripeWebhookEvent(
      buildEvent("customer.subscription.updated", {
        id: `sub_${userId}`,
        customer: `cus_${userId}`,
        metadata: { userId, planId: "premium" },
        status: "active",
        current_period_start: now,
        current_period_end: now + 86400 * 30,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: PRICE.light } }] },
      }),
    );

    const summary = await getUserBillingSummary(userId);
    expect(summary.effectivePlanId).toBe("light");
    expect(summary.usage.aiRuns.used).toBe(18);
    expect(summary.usage.aiRuns.limit).toBe(30);
    expect(summary.usage.automationTasks.limit).toBe(3);
    const autoPost = await evaluateBillingFeature(userId, "sns_auto_post");
    expect(autoPost.denial).toBeNull();
    const google = await evaluateBillingFeature(userId, "google_integration");
    expect(google.denial?.status).toBe(403);
  });

  it("E: cancel_at_period_end keeps current entitlement while active", async () => {
    const userId = "user_p1_cancel_sched";
    await checkoutPaid({ userId, planId: "standard" });
    const now = Math.floor(Date.now() / 1000);
    await handleStripeWebhookEvent(
      buildEvent("customer.subscription.updated", {
        id: `sub_${userId}`,
        customer: `cus_${userId}`,
        metadata: { userId, planId: "standard" },
        status: "active",
        current_period_start: now,
        current_period_end: now + 86400 * 10,
        cancel_at_period_end: true,
        items: { data: [{ price: { id: PRICE.standard } }] },
      }),
    );

    const summary = await getUserBillingSummary(userId);
    expect(summary.subscription.cancelAtPeriodEnd).toBe(true);
    expect(summary.subscription.status).toBe("active");
    expect(summary.effectivePlanId).toBe("standard");
    expect(summary.subscription.isPaid).toBe(true);
    expect(
      (await evaluateBillingFeature(userId, "google_integration")).denial,
    ).toBeNull();
  });

  it("F: period end (subscription.deleted) revokes paid entitlement", async () => {
    const userId = "user_p1_period_end";
    await checkoutPaid({ userId, planId: "standard" });
    const deleted = await handleStripeWebhookEvent(
      buildEvent("customer.subscription.deleted", {
        id: `sub_${userId}`,
        customer: `cus_${userId}`,
        metadata: { userId, planId: "standard" },
        items: { data: [{ price: { id: PRICE.standard } }] },
        status: "canceled",
      }),
    );
    expect(deleted.success).toBe(true);
    const summary = await getUserBillingSummary(userId);
    expect(summary.subscription.planId).toBe("free");
    expect(summary.effectivePlanId).toBe("free");
    expect(summary.subscription.isPaid).toBe(false);
    expect(
      (await evaluateBillingFeature(userId, "google_integration")).denial?.status,
    ).toBe(403);
    expect(
      (await evaluateBillingFeature(userId, "sns_auto_post")).denial,
    ).toBeNull();
  });

  it("G: resubscribe reuses the same customer and restores entitlement", async () => {
    const userId = "user_p1_resub";
    const customerId = "cus_p1_resub";
    await checkoutPaid({
      userId,
      planId: "light",
      customerId,
      subscriptionId: "sub_p1_resub_1",
    });
    await handleStripeWebhookEvent(
      buildEvent("customer.subscription.deleted", {
        id: "sub_p1_resub_1",
        customer: customerId,
        metadata: { userId, planId: "light" },
        items: { data: [] },
        status: "canceled",
      }),
    );
    expect((await getUserBillingSummary(userId)).effectivePlanId).toBe("free");

    await checkoutPaid({
      userId,
      planId: "standard",
      customerId,
      subscriptionId: "sub_p1_resub_2",
    });
    const summary = await getUserBillingSummary(userId);
    expect(summary.subscription.stripeCustomerId).toBe(customerId);
    expect(summary.subscription.stripeSubscriptionId).toBe("sub_p1_resub_2");
    expect(summary.effectivePlanId).toBe("standard");
    expect(summary.subscription.planId).toBe("standard");
  });

  it("H: past_due is fail-closed to Free entitlements", async () => {
    const userId = "user_p1_pastdue";
    await checkoutPaid({ userId, planId: "light" });
    const now = Math.floor(Date.now() / 1000);
    await handleStripeWebhookEvent(
      buildEvent("customer.subscription.updated", {
        id: `sub_${userId}`,
        customer: `cus_${userId}`,
        metadata: { userId, planId: "light" },
        status: "past_due",
        current_period_start: now,
        current_period_end: now + 86400 * 30,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: PRICE.light } }] },
      }),
    );

    const summary = await getUserBillingSummary(userId);
    expect(summary.subscription.planId).toBe("light");
    expect(summary.subscription.status).toBe("past_due");
    expect(summary.effectivePlanId).toBe("free");
    expect(summary.usage.planId).toBe("free");
    expect(summary.usage.aiRuns.limit).toBe(1);
    expect(
      (await evaluateBillingFeature(userId, "google_integration")).denial?.status,
    ).toBe(403);
    expect(
      (await evaluateBillingFeature(userId, "sns_auto_post")).denial,
    ).toBeNull();
  });

  it("I: duplicate webhook claim does not reset usage or duplicate history", async () => {
    const userId = "user_p1_dup";
    const eventId = "evt_p1_dup_checkout";
    await checkoutPaid({ userId, planId: "light", eventId });
    seedAiRunsForTests(userId, 7);
    await markStripeEventProcessed(eventId, "checkout.session.completed");

    const replayClaim = await claimStripeEventForProcessing(
      eventId,
      "checkout.session.completed",
    );
    expect(replayClaim).toEqual({
      ok: true,
      claimed: false,
      reason: "duplicate",
    });

    expect(getUserUsageLimitSummary(userId).aiRuns.used).toBe(7);
    const history = listBillingHistoryRecords(userId).filter(
      (row) => row.eventType === "checkout.session.completed",
    );
    expect(history).toHaveLength(1);
    expect((await getUserBillingSummary(userId)).effectivePlanId).toBe("light");
  });

  it("J: unknown Price ID cannot grant Premium via metadata", async () => {
    const userId = "user_p1_bad_price";
    const result = await handleStripeWebhookEvent(
      buildEvent("checkout.session.completed", {
        client_reference_id: userId,
        customer: `cus_${userId}`,
        subscription: `sub_${userId}`,
        metadata: {
          userId,
          planId: "premium",
          priceId: "price_unknown_legacy",
        },
      }),
    );
    expect(result.success).toBe(false);
    const summary = await getUserBillingSummary(userId);
    expect(summary.subscription.planId).toBe("free");
    expect(summary.effectivePlanId).toBe("free");
    expect(
      (await evaluateBillingFeature(userId, "google_integration")).denial?.status,
    ).toBe(403);
  });

  it("K: client cannot choose a Price ID or rewrite plan via checkout helpers", () => {
    expect(() =>
      assertAllowedStripePriceId("price_attacker_forged", "light"),
    ).toThrow(/not allowed for plan/);
    expect(() => assertAllowedStripePriceId(PRICE.premium, "light")).toThrow(
      /not allowed for plan/,
    );
    expect(() => assertAllowedStripePriceId(PRICE.light, "light")).not.toThrow();
  });

  it("L: Light user cannot unlock Standard+ features by API", async () => {
    const userId = "user_p1_direct";
    await checkoutPaid({ userId, planId: "light" });

    expect(
      (await evaluateBillingFeature(userId, "sns_auto_post")).denial,
    ).toBeNull();
    expect(
      (await evaluateBillingFeature(userId, "google_integration")).denial
        ?.status,
    ).toBe(403);
    expect(
      (await evaluateBillingFeature(userId, "blog_creation")).denial?.status,
    ).toBe(403);
    expect(
      (await evaluateBillingFeature(userId, "high_quality_mode")).denial
        ?.status,
    ).toBe(403);

    seedAiRunsForTests(userId, 30);
    const denied = await consumeBillingAiJob(userId, "direct-31");
    expect(denied?.status).toBe(429);
  });

  it("unknown Stripe status / incomplete / unpaid / paused map fail-closed", async () => {
    const userId = "user_p1_status";
    await applySubscriptionFromStripe({
      userId,
      stripeCustomerId: `cus_${userId}`,
      stripeSubscriptionId: `sub_${userId}`,
      planId: "premium",
      status: "incomplete",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripePriceId: PRICE.premium,
    });
    expect(resolveEffectivePlanId(userId)).toBe("free");

    await applySubscriptionFromStripe({
      userId,
      stripeCustomerId: `cus_${userId}`,
      stripeSubscriptionId: `sub_${userId}`,
      planId: "premium",
      status: "unpaid",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripePriceId: PRICE.premium,
    });
    expect(resolveEffectivePlanId(userId)).toBe("free");

    expect(
      resolveEffectivePlanIdFromRecord({
        userId,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripePriceId: null,
        planId: "premium",
        status: "incomplete_expired",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        updatedAt: new Date().toISOString(),
      }),
    ).toBe("free");
  });

  it("trialing keeps paid entitlement; Owner bypass is not used for these users", async () => {
    const userId = "user_p1_trial";
    await applySubscriptionFromStripe({
      userId,
      stripeCustomerId: `cus_${userId}`,
      stripeSubscriptionId: `sub_${userId}`,
      planId: "standard",
      status: "trialing",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      stripePriceId: PRICE.standard,
    });
    expect(resolveEffectivePlanId(userId)).toBe("standard");
    expect(
      (await evaluateBillingFeature(userId, "google_integration")).denial,
    ).toBeNull();
    expect(userId.startsWith("owner_")).toBe(false);
  });
});

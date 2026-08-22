/**
 * FINAL: Pricing / Billing / Entitlement cross audit.
 * No live Stripe charges. Plan Registry is the only price/limit source of truth.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: () => null,
}));

import { evaluateBillingFeature } from "./access/snapshot";
import { getUserBillingSummary } from "./service";
import { getLandingPlans } from "@/lib/landing/content";
import { LIGHT_PLAN_JPY, lightPlanYenLabel } from "@/lib/landing/pay-reason";
import {
  checkAiUsageLimit,
  checkAutomationTaskLimit,
  checkExternalIntegrationLimit,
  checkFeatureAccess,
  getPlanDefinition,
  type PlanId,
} from "./plans";
import { resolveUsageDisplay } from "./usage-awareness/load-state";
import { resolveEffectivePlanIdFromRecord } from "./subscriptions/service";
import { resetSubscriptionStore } from "./subscriptions/store";
import { handleStripeWebhookEvent, isStaleStripeEvent } from "./stripe/webhook-handlers";
import { resolvePaidPlanFromStripeRefs } from "./stripe/resolve-paid-plan";
import {
  getStripeRuntimeConfigStatus,
  HANDLED_STRIPE_EVENTS,
  resolvePlanIdFromStripePrice,
} from "./stripe/config";
import { resetBillingHistoryStore } from "./history/store";
import { resetBillingNotificationStore } from "./notifications/store";
import { resetProcessedStripeEvents } from "./stripe/webhook-idempotency";
import { incrementUsageCounterOnce, resetUsageStore } from "./usage/store";
import { resetAiQuotaEngineForTests, seedAiRunsForTests } from "./usage/quota-engine";
import { getUserUsageLimitSummary } from "./usage/service";

const PRICE = {
  light: "price_final_light",
  standard: "price_final_standard",
  premium: "price_final_premium",
} as const;

const PLANS: PlanId[] = ["free", "light", "standard", "premium"];

const EXPECTED = {
  free: {
    yen: 0,
    ai: 1,
    automations: 1,
    integrations: 1,
    paidFeatures: ["sns_assist", "sns_auto_post"] as const,
  },
  light: {
    yen: 980,
    ai: 30,
    automations: 3,
    integrations: 1,
    paidFeatures: ["sns_assist", "sns_auto_post"] as const,
  },
  standard: {
    yen: 2980,
    ai: 100,
    automations: 10,
    integrations: 3,
    paidFeatures: ["sns_assist", "sns_auto_post", "google_integration"] as const,
  },
  premium: {
    yen: 9800,
    ai: 300,
    automations: 50,
    integrations: 10,
    paidFeatures: [
      "sns_assist",
      "sns_auto_post",
      "google_integration",
      "high_quality_mode",
    ] as const,
  },
} as const;

function usage(aiRuns: number) {
  return {
    userId: "user_final",
    month: "2026-08",
    updatedAt: "2026-08-22T00:00:00.000Z",
    aiRuns,
    snsPosts: 0,
    xUrlPosts: 0,
    wordpressPosts: 0,
    automationTasksActive: 0,
  } as const;
}

function buildEvent<T extends string>(
  type: T,
  object: Record<string, unknown>,
  id = `evt_${type}_${Math.random().toString(36).slice(2, 8)}`,
  created?: number,
): Parameters<typeof handleStripeWebhookEvent>[0] {
  return {
    id,
    type,
    created,
    data: { object },
  };
}

async function checkoutPaid(input: {
  userId: string;
  planId: "light" | "standard" | "premium";
  customerId?: string;
  subscriptionId?: string;
  created?: number;
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
      undefined,
      input.created,
    ),
  );
}

describe("FINAL billing cross audit", () => {
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("FINAL-13 matrix: registry, landing, limits, entitlement, Stripe map", async () => {
    const landing = getLandingPlans();
    expect(LIGHT_PLAN_JPY).toBe(EXPECTED.light.yen);
    expect(lightPlanYenLabel()).toBe("980円");

    for (const planId of PLANS) {
      const plan = getPlanDefinition(planId);
      const expected = EXPECTED[planId];
      const card = landing.find((row) => row.planId === planId);
      expect(plan.monthlyPriceJpy).toBe(expected.yen);
      expect(plan.limits.aiUsageMonthly).toBe(expected.ai);
      expect(plan.limits.automationTasks).toBe(expected.automations);
      expect(plan.limits.externalIntegrations).toBe(expected.integrations);
      expect(card?.monthlyPriceJpy).toBe(plan.monthlyPriceJpy);
      expect(card?.name).toBe(plan.name);
      expect(card?.limits.aiUsageMonthly).toBe(plan.limits.aiUsageMonthly);
      expect(card?.highlights).toEqual(plan.highlights);

      if (planId === "free") {
        expect(resolvePlanIdFromStripePrice(PRICE.light)).toBe("light");
        expect(checkFeatureAccess("free", "sns_assist").allowed).toBe(true);
        expect(checkFeatureAccess("free", "sns_auto_post").allowed).toBe(true);
        expect(checkFeatureAccess("free", "google_integration").allowed).toBe(false);
        expect(checkAutomationTaskLimit("free", 0).allowed).toBe(true);
        expect(checkAutomationTaskLimit("free", 1).allowed).toBe(false);
        expect(checkExternalIntegrationLimit("free", 0).allowed).toBe(true);
        expect(checkExternalIntegrationLimit("free", 1).allowed).toBe(false);
      } else {
        expect(resolvePlanIdFromStripePrice(PRICE[planId])).toBe(planId);
      }

      for (const feature of expected.paidFeatures) {
        expect(checkFeatureAccess(planId, feature).allowed).toBe(true);
      }

      expect(checkAiUsageLimit(planId, usage(expected.ai - 1)).allowed).toBe(true);
      expect(checkAiUsageLimit(planId, usage(expected.ai)).allowed).toBe(false);
      expect(checkAiUsageLimit(planId, usage(expected.ai + 1)).allowed).toBe(false);

      const userId = `user_final_${planId}`;
      if (planId === "free") {
        const summary = await getUserBillingSummary(userId);
        expect(summary.effectivePlanId).toBe("free");
        expect(summary.plan.monthlyPriceJpy).toBe(0);
        expect(summary.usage.aiRuns.limit).toBe(1);
        expect((await evaluateBillingFeature(userId, "sns_assist")).denial).toBeNull();
        expect(
          (await evaluateBillingFeature(userId, "google_integration")).denial?.status,
        ).toBe(403);
      } else {
        await checkoutPaid({ userId, planId });
        const summary = await getUserBillingSummary(userId);
        expect(summary.subscription.planId).toBe(planId);
        expect(summary.effectivePlanId).toBe(planId);
        expect(summary.plan.monthlyPriceJpy).toBe(expected.yen);
        expect(summary.usage.aiRuns.limit).toBe(expected.ai);
        expect(summary.usage.automationTasks.limit).toBe(expected.automations);
        expect(summary.subscription.stripePriceId).toBe(PRICE[planId]);
        expect(summary.plan.name).toBe(plan.name);
      }
    }
  });

  it("FINAL-01: public pricing surfaces do not hardcode leftover ATLAS yen", () => {
    const root = process.cwd();
    const files = [
      "components/landing/landing-page.tsx",
      "components/landing/landing-price-value.tsx",
      "components/settings/billing-settings.tsx",
      "app/pricing/page.tsx",
      "lib/legal/legal-content.ts",
      "lib/landing/content.ts",
      "lib/landing/pay-reason.ts",
      "lib/billing/client.ts",
    ];
    const forbidden = /\b(1,?980|3,?980|4,?980|5,?980|12,?800|19,?800)\b/;
    for (const relative of files) {
      const src = readFileSync(join(root, relative), "utf8");
      expect(src, relative).not.toMatch(forbidden);
    }
    expect(readFileSync(join(root, "lib/landing/content.ts"), "utf8")).toContain(
      "listPlanDefinitions",
    );
    expect(
      readFileSync(join(root, "components/settings/billing-settings.tsx"), "utf8"),
    ).toContain("formatPlanPriceJpy");
  });

  it("FINAL-02: metadata.planId or unknown Price cannot grant Premium", () => {
    expect(
      resolvePaidPlanFromStripeRefs({
        priceId: null,
        metadataPlanId: "premium",
      }).planId,
    ).toBeNull();
    expect(
      resolvePaidPlanFromStripeRefs({
        priceId: "price_forged",
        metadataPlanId: "premium",
      }),
    ).toMatchObject({ planId: null, unknownPrice: true });
    expect(
      resolvePaidPlanFromStripeRefs({
        priceId: PRICE.light,
        metadataPlanId: "premium",
      }).planId,
    ).toBe("light");
  });

  it("FINAL-04/10: stale or previous-subscription events do not rewind paid state", async () => {
    const userId = "user_final_stale";
    await checkoutPaid({
      userId,
      planId: "light",
      subscriptionId: "sub_old",
      created: 1_700_000_000,
    });
    await checkoutPaid({
      userId,
      planId: "premium",
      subscriptionId: "sub_new",
      created: 1_700_000_100,
    });
    expect((await getUserBillingSummary(userId)).effectivePlanId).toBe("premium");

    const deleted = await handleStripeWebhookEvent(
      buildEvent(
        "customer.subscription.deleted",
        {
          id: "sub_old",
          customer: `cus_${userId}`,
          metadata: { userId, planId: "light" },
          items: { data: [] },
          status: "canceled",
        },
        "evt_stale_del",
        1_700_000_050,
      ),
    );
    expect(deleted.success).toBe(true);
    expect((await getUserBillingSummary(userId)).effectivePlanId).toBe("premium");

    const staleUpdate = await handleStripeWebhookEvent(
      buildEvent(
        "customer.subscription.updated",
        {
          id: "sub_old",
          customer: `cus_${userId}`,
          metadata: { userId, planId: "light" },
          status: "active",
          items: { data: [{ price: { id: PRICE.light } }] },
        },
        "evt_stale_upd",
        1_700_000_010,
      ),
    );
    expect(staleUpdate.message).toMatch(/previous subscription|stale/i);
    expect((await getUserBillingSummary(userId)).effectivePlanId).toBe("premium");
  });

  it("FINAL-04: same-subscription stale event clock is ignored", () => {
    expect(
      isStaleStripeEvent(1_700_000_000, "2023-11-14T22:13:21.000Z"),
    ).toBe(true);
    expect(
      isStaleStripeEvent(1_700_000_100, "2023-11-14T22:13:20.000Z"),
    ).toBe(false);
    expect(isStaleStripeEvent(1_700_000_000, "2023-11-14T22:13:21.123Z")).toBe(
      false,
    );
  });

  it("FINAL-07: retry does not double-count usage", () => {
    const userId = "user_final_meter";
    const first = incrementUsageCounterOnce(userId, "aiRuns", "job_final_1");
    const retry = incrementUsageCounterOnce(userId, "aiRuns", "job_final_1");
    expect(first.incremented).toBe(true);
    expect(retry.incremented).toBe(false);
    expect(first.snapshot.aiRuns).toBe(1);
    expect(retry.snapshot.aiRuns).toBe(1);
  });

  it("FINAL-08/09/11/12: upgrade, cancel-at-period-end, past_due, and fail-closed UI", async () => {
    const userId = "user_final_life";
    await checkoutPaid({ userId, planId: "light" });
    seedAiRunsForTests(userId, 12);

    const now = Math.floor(Date.now() / 1000);
    await handleStripeWebhookEvent(
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
    let summary = await getUserBillingSummary(userId);
    expect(summary.effectivePlanId).toBe("standard");
    expect(summary.usage.aiRuns.used).toBe(12);
    expect(summary.usage.aiRuns.limit).toBe(100);

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
    summary = await getUserBillingSummary(userId);
    expect(summary.subscription.cancelAtPeriodEnd).toBe(true);
    expect(summary.effectivePlanId).toBe("standard");
    expect(summary.subscription.isPaid).toBe(true);

    await handleStripeWebhookEvent(
      buildEvent("customer.subscription.updated", {
        id: `sub_${userId}`,
        customer: `cus_${userId}`,
        metadata: { userId, planId: "standard" },
        status: "past_due",
        items: { data: [{ price: { id: PRICE.standard } }] },
      }),
    );
    summary = await getUserBillingSummary(userId);
    expect(summary.subscription.planId).toBe("standard");
    expect(summary.effectivePlanId).toBe("free");
    expect(summary.usage.planId).toBe("free");
    expect(resolveUsageDisplay({ ready: false, used: 0, limit: 30 }).kind).toBe(
      "unavailable",
    );

    for (const status of [
      "unpaid",
      "incomplete",
      "incomplete_expired",
      "canceled",
    ] as const) {
      expect(
        resolveEffectivePlanIdFromRecord({
          userId,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          stripePriceId: null,
          planId: "premium",
          status,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          updatedAt: new Date().toISOString(),
        }),
      ).toBe("free");
    }
  });

  it("FINAL-14: cross-user subscription and billing summary stay isolated", async () => {
    await checkoutPaid({ userId: "user_final_a", planId: "premium" });
    const a = await getUserBillingSummary("user_final_a");
    const b = await getUserBillingSummary("user_final_b");
    expect(a.effectivePlanId).toBe("premium");
    expect(b.effectivePlanId).toBe("free");
    expect(b.subscription.stripeSubscriptionId).not.toBe(
      a.subscription.stripeSubscriptionId,
    );
    expect(getUserUsageLimitSummary("user_final_b").aiRuns.limit).toBe(1);
  });

  it("FINAL-15: Stripe env status never embeds secret values", () => {
    const status = getStripeRuntimeConfigStatus();
    const serialized = JSON.stringify(status);
    expect(serialized).not.toMatch(/sk_live_|sk_test_|whsec_|pk_live_/);
    expect(HANDLED_STRIPE_EVENTS).toEqual(
      expect.arrayContaining([
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
      ]),
    );
  });
});

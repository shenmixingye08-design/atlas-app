/**
 * Billing Production critical-path regression suite.
 *
 * Required coverage:
 * 1. valid webhook → entitlement grant
 * 2. invalid signature → reject
 * 3. duplicate webhook → no double mutation
 * 4. wrong user/customer → no cross-user entitlement
 * 5. entitlement grant (Light)
 * 6. cancellation / revocation
 *
 * Also: client cannot supply free-form priceId / rewrite plan via checkout helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { evaluateBillingFeature } from "../access/snapshot";
import { getPlanDefinition } from "../plans/registry";
import { listBillingHistoryRecords, resetBillingHistoryStore } from "../history/store";
import { resetBillingNotificationStore } from "../notifications/store";
import { applySubscriptionFromStripe, getUserSubscriptionView } from "../subscriptions/service";
import { resetSubscriptionStore, saveUserSubscription } from "../subscriptions/store";
import { assertAllowedStripePriceId } from "./checkout";
import { processStripeWebhookRequest } from "./webhook";
import { handleStripeWebhookEvent } from "./webhook-handlers";
import {
  claimStripeEventForProcessing,
  hasProcessedStripeEvent,
  markStripeEventProcessed,
  resetProcessedStripeEvents,
} from "./webhook-idempotency";
import { resetStripeWebhookLogStore } from "@/lib/owner/billing-webhook/store";

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

describe("Billing Production regression", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "test");
    vi.stubEnv("STRIPE_PRICE_LIGHT", "price_light_live_allowlist");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_live_allowlist");
    vi.stubEnv("STRIPE_PRICE_PREMIUM", "price_premium_live_allowlist");
    resetSubscriptionStore();
    resetBillingHistoryStore();
    resetBillingNotificationStore();
    resetStripeWebhookLogStore();
    resetProcessedStripeEvents();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetProcessedStripeEvents();
  });

  it("1+5: valid checkout webhook grants Light entitlement", async () => {
    expect(getPlanDefinition("light").monthlyPriceJpy).toBe(980);

    const result = await handleStripeWebhookEvent(
      buildEvent("checkout.session.completed", {
        client_reference_id: "user_light_ok",
        customer: "cus_light_ok",
        subscription: "sub_light_ok",
        metadata: {
          userId: "user_light_ok",
          planId: "light",
          priceId: "price_light_live_allowlist",
        },
      }),
    );

    expect(result.success).toBe(true);
    const view = getUserSubscriptionView("user_light_ok");
    expect(view.planId).toBe("light");
    expect(view.isPaid).toBe(true);
    expect(view.stripeCustomerId).toBe("cus_light_ok");

    const { denial } = await evaluateBillingFeature(
      "user_light_ok",
      "sns_assist",
    );
    expect(denial).toBeNull();
  });

  it("2: invalid / missing Stripe signature is rejected", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_example");

    const missing = await processStripeWebhookRequest("{}", null);
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe("Missing Stripe signature");

    const invalid = await processStripeWebhookRequest("{}", "t=1,v1=bad");
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe("Invalid Stripe signature");
  });

  it("3: duplicate webhook claim does not double-apply entitlement", async () => {
    const eventId = `evt_dup_${Date.now()}`;
    const firstClaim = await claimStripeEventForProcessing(
      eventId,
      "checkout.session.completed",
    );
    expect(firstClaim).toEqual({ ok: true, claimed: true });

    await handleStripeWebhookEvent(
      buildEvent(
        "checkout.session.completed",
        {
          client_reference_id: "user_dup",
          customer: "cus_dup",
          subscription: "sub_dup",
          metadata: { userId: "user_dup", planId: "light" },
        },
        eventId,
      ),
    );
    await markStripeEventProcessed(eventId, "checkout.session.completed");
    expect(await hasProcessedStripeEvent(eventId)).toBe(true);

    const replay = await claimStripeEventForProcessing(
      eventId,
      "checkout.session.completed",
    );
    expect(replay).toEqual({
      ok: true,
      claimed: false,
      reason: "duplicate",
    });

    // Re-running handler without claim would be unsafe in production;
    // production path blocks via claim. Assert single history row for checkout.
    const history = listBillingHistoryRecords("user_dup").filter(
      (row) => row.eventType === "checkout.session.completed",
    );
    expect(history).toHaveLength(1);
    expect(getUserSubscriptionView("user_dup").planId).toBe("light");
  });

  it("4: wrong user/customer mapping does not grant Light to another user", async () => {
    const now = new Date().toISOString();
    saveUserSubscription({
      userId: "user_a_owner",
      stripeCustomerId: "cus_owned_by_a",
      stripeSubscriptionId: "sub_a",
      stripePriceId: "price_light_live_allowlist",
      planId: "light",
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: now,
    });

    const result = await handleStripeWebhookEvent(
      buildEvent("checkout.session.completed", {
        client_reference_id: "user_b_attacker",
        customer: "cus_owned_by_a",
        subscription: "sub_b_spoof",
        metadata: {
          userId: "user_b_attacker",
          planId: "light",
        },
      }),
    );

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.message).toMatch(/already linked to another user/i);

    expect(getUserSubscriptionView("user_b_attacker").planId).toBe("free");
    expect(getUserSubscriptionView("user_b_attacker").isPaid).toBe(false);
    expect(getUserSubscriptionView("user_a_owner").planId).toBe("light");

    const { denial } = await evaluateBillingFeature(
      "user_b_attacker",
      "sns_assist",
    );
    expect(denial?.status).toBe(403);
  });

  it("6: subscription deletion revokes entitlement to Free", async () => {
    await applySubscriptionFromStripe({
      userId: "user_cancel",
      stripeCustomerId: "cus_cancel",
      stripeSubscriptionId: "sub_cancel",
      planId: "light",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    expect(getUserSubscriptionView("user_cancel").isPaid).toBe(true);

    const result = await handleStripeWebhookEvent(
      buildEvent("customer.subscription.deleted", {
        id: "sub_cancel",
        customer: "cus_cancel",
        metadata: { userId: "user_cancel", planId: "light" },
        items: { data: [] },
        status: "canceled",
      }),
    );

    expect(result.success).toBe(true);
    const view = getUserSubscriptionView("user_cancel");
    expect(view.planId).toBe("free");
    expect(view.isPaid).toBe(false);
    expect(view.automationsSuspended).toBe(true);

    const { denial } = await evaluateBillingFeature("user_cancel", "sns_assist");
    expect(denial?.status).toBe(403);
  });

  it("server-authoritative: only allowlisted Price IDs may be used for a plan", () => {
    expect(() =>
      assertAllowedStripePriceId("price_light_live_allowlist", "light"),
    ).not.toThrow();

    expect(() =>
      assertAllowedStripePriceId("price_attacker_forged", "light"),
    ).toThrow(/not allowed for plan/);

    expect(() =>
      assertAllowedStripePriceId("price_standard_live_allowlist", "light"),
    ).toThrow(/not allowed for plan/);
  });

  it("Light registry is ¥980/month JPY product definition", () => {
    const light = getPlanDefinition("light");
    expect(light.monthlyPriceJpy).toBe(980);
    expect(light.planId).toBe("light");
  });
});

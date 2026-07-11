import { beforeEach, describe, expect, it } from "vitest";

import { listBillingHistoryRecords, resetBillingHistoryStore } from "../history/store";
import { resetBillingNotificationStore } from "../notifications/store";
import { getUserSubscriptionView } from "../subscriptions/service";
import { resetSubscriptionStore } from "../subscriptions/store";
import { resetProcessedStripeEvents } from "./webhook-idempotency";
import { handleStripeWebhookEvent } from "./webhook-handlers";
import { resetStripeWebhookLogStore } from "@/lib/owner/billing-webhook/store";

function buildEvent<T extends string>(
  type: T,
  object: Record<string, unknown>,
  id = `evt_${type}`,
): Parameters<typeof handleStripeWebhookEvent>[0] {
  return {
    id,
    type,
    data: { object },
  } as Parameters<typeof handleStripeWebhookEvent>[0];
}

describe("stripe webhook handlers", () => {
  beforeEach(() => {
    resetSubscriptionStore();
    resetBillingHistoryStore();
    resetBillingNotificationStore();
    resetStripeWebhookLogStore();
    resetProcessedStripeEvents();
  });

  it("applies plan on checkout.session.completed", async () => {
    const result = await handleStripeWebhookEvent(
      buildEvent("checkout.session.completed", {
        client_reference_id: "user_checkout_1",
        customer: "cus_123",
        subscription: "sub_456",
        metadata: { userId: "user_checkout_1", planId: "standard" },
      }),
    );

    expect(result.success).toBe(true);
    const view = getUserSubscriptionView("user_checkout_1");
    expect(view.planId).toBe("standard");
    expect(view.stripeCustomerId).toBe("cus_123");
    expect(view.stripeSubscriptionId).toBe("sub_456");
    expect(listBillingHistoryRecords("user_checkout_1").length).toBeGreaterThan(0);
  });

  it("downgrades to free and suspends automations on subscription deleted", async () => {
    const { applySubscriptionFromStripe } = await import("../subscriptions/service");

    applySubscriptionFromStripe({
      userId: "user_delete_1",
      stripeCustomerId: "cus_del",
      stripeSubscriptionId: "sub_del",
      planId: "light",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const result = await handleStripeWebhookEvent(
      buildEvent("customer.subscription.deleted", {
        id: "sub_del",
        customer: "cus_del",
        metadata: { userId: "user_delete_1", planId: "light" },
        items: { data: [] },
        status: "canceled",
      }),
    );

    expect(result.success).toBe(true);
    const view = getUserSubscriptionView("user_delete_1");
    expect(view.planId).toBe("free");
    expect(view.automationsSuspended).toBe(true);
  });

  it("schedules grace period and notifies on invoice.payment_failed", async () => {
    const { applySubscriptionFromStripe } = await import("../subscriptions/service");

    applySubscriptionFromStripe({
      userId: "user_fail_1",
      stripeCustomerId: "cus_fail",
      stripeSubscriptionId: "sub_fail",
      planId: "premium",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const result = await handleStripeWebhookEvent(
      buildEvent("invoice.payment_failed", {
        customer: "cus_fail",
        subscription: "sub_fail",
      }),
    );

    expect(result.success).toBe(true);
    const view = getUserSubscriptionView("user_fail_1");
    expect(view.paymentFailureGraceEndsAt).toBeTruthy();
    expect(view.status).toBe("past_due");
  });

  it("keeps payment grace when subscription.updated reports past_due", async () => {
    const { applySubscriptionFromStripe } = await import("../subscriptions/service");
    const { schedulePaymentFailureGrace } = await import(
      "../subscriptions/lifecycle"
    );

    applySubscriptionFromStripe({
      userId: "user_grace_1",
      stripeCustomerId: "cus_grace",
      stripeSubscriptionId: "sub_grace",
      planId: "standard",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
    schedulePaymentFailureGrace("user_grace_1");
    const graceBefore =
      getUserSubscriptionView("user_grace_1").paymentFailureGraceEndsAt;

    await handleStripeWebhookEvent(
      buildEvent("customer.subscription.updated", {
        id: "sub_grace",
        customer: "cus_grace",
        metadata: { userId: "user_grace_1", planId: "standard" },
        status: "past_due",
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: "price_standard_test" } }] },
      }),
    );

    const view = getUserSubscriptionView("user_grace_1");
    expect(view.status).toBe("past_due");
    expect(view.paymentFailureGraceEndsAt).toBe(graceBefore);
  });

  it("records charge.refunded in billing history without auto-downgrade", async () => {
    const { applySubscriptionFromStripe } = await import("../subscriptions/service");

    applySubscriptionFromStripe({
      userId: "user_refund_1",
      stripeCustomerId: "cus_refund",
      stripeSubscriptionId: "sub_refund",
      planId: "light",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const result = await handleStripeWebhookEvent(
      buildEvent("charge.refunded", {
        customer: "cus_refund",
        amount: 1000,
        amount_refunded: 1000,
      }),
    );

    expect(result.success).toBe(true);
    expect(getUserSubscriptionView("user_refund_1").planId).toBe("light");
    expect(
      listBillingHistoryRecords("user_refund_1").some(
        (row) => row.eventType === "charge.refunded",
      ),
    ).toBe(true);
  });

  it("syncs subscription updates", async () => {
    const result = await handleStripeWebhookEvent(
      buildEvent("customer.subscription.updated", {
        id: "sub_upd",
        customer: "cus_upd",
        metadata: { userId: "user_upd_1", planId: "premium" },
        status: "active",
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        cancel_at_period_end: false,
        items: { data: [{ price: { id: "price_premium_test" } }] },
      }),
    );

    expect(result.success).toBe(true);
    const view = getUserSubscriptionView("user_upd_1");
    expect(view.planId).toBe("premium");
    expect(view.stripePriceId).toBe("price_premium_test");
  });

  it("treats invoice.paid like payment succeeded", async () => {
    const { applySubscriptionFromStripe } = await import("../subscriptions/service");

    applySubscriptionFromStripe({
      userId: "user_paid_1",
      stripeCustomerId: "cus_paid",
      stripeSubscriptionId: "sub_paid",
      planId: "light",
      status: "past_due",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const result = await handleStripeWebhookEvent(
      buildEvent("invoice.paid", {
        customer: "cus_paid",
        subscription: "sub_paid",
      }),
    );

    expect(result.success).toBe(true);
    expect(result.userId).toBe("user_paid_1");
  });
});

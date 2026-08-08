import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  claimStripeEventForProcessing,
  hasProcessedStripeEvent,
  markStripeEventProcessed,
  releaseStripeEventClaim,
  resetProcessedStripeEvents,
} from "./webhook-idempotency";
import {
  expireWebhookClaimLeaseForTests,
  setWebhookClaimLeaseMsForTests,
} from "./webhook-claim-lease";
import { handleStripeWebhookEvent } from "./webhook-handlers";
import { resetSubscriptionStore } from "../subscriptions/store";
import { resetBillingHistoryStore } from "../history/store";
import { resetBillingNotificationStore } from "../notifications/store";
import { getUserSubscriptionView } from "../subscriptions/service";
import { resetStripeWebhookLogStore } from "@/lib/owner/billing-webhook/store";

function buildEvent<T extends string>(
  type: T,
  object: Record<string, unknown>,
  id: string,
): Parameters<typeof handleStripeWebhookEvent>[0] {
  return {
    id,
    type,
    data: { object },
  };
}

describe("P0 FINAL GATE webhook claim lease (H1/H2)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "test");
    resetProcessedStripeEvents();
    resetSubscriptionStore();
    resetBillingHistoryStore();
    resetBillingNotificationStore();
    resetStripeWebhookLogStore();
    setWebhookClaimLeaseMsForTests(50);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetProcessedStripeEvents();
    setWebhookClaimLeaseMsForTests(null);
  });

  it("A: normal webhook success marks processed only after mark", async () => {
    const eventId = `evt_final_a_${Date.now()}`;
    const claim = await claimStripeEventForProcessing(eventId, "invoice.paid");
    expect(claim).toEqual({ ok: true, claimed: true });
    expect(await hasProcessedStripeEvent(eventId)).toBe(false);

    await markStripeEventProcessed(eventId, "invoice.paid");
    expect(await hasProcessedStripeEvent(eventId)).toBe(true);
  });

  it("B: same event concurrent delivery is single-winner", async () => {
    const eventId = `evt_final_b_${Date.now()}`;
    const [a, b] = await Promise.all([
      claimStripeEventForProcessing(eventId, "invoice.paid"),
      claimStripeEventForProcessing(eventId, "invoice.paid"),
    ]);
    const winners = [a, b].filter((r) => r.ok && r.claimed);
    const losers = [a, b].filter((r) => r.ok && !r.claimed);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toMatchObject({ reason: "in_progress" });
  });

  it("C: handler failure → release → retry claim succeeds", async () => {
    const eventId = `evt_final_c_${Date.now()}`;
    const first = await claimStripeEventForProcessing(eventId, "invoice.paid");
    expect(first.ok && first.claimed).toBe(true);
    await releaseStripeEventClaim(eventId);
    const again = await claimStripeEventForProcessing(eventId, "invoice.paid");
    expect(again.ok && again.claimed).toBe(true);
    expect(await hasProcessedStripeEvent(eventId)).toBe(false);
  });

  it("D: crash after claim → TTL expire → reclaim → success", async () => {
    const eventId = `evt_final_d_${Date.now()}`;
    const first = await claimStripeEventForProcessing(eventId, "invoice.paid");
    expect(first.ok && first.claimed).toBe(true);
    // Simulate process kill: no release, no mark.
    expireWebhookClaimLeaseForTests(eventId);

    const reclaim = await claimStripeEventForProcessing(eventId, "invoice.paid");
    expect(reclaim.ok && reclaim.claimed).toBe(true);
    await markStripeEventProcessed(eventId, "invoice.paid");
    expect(await hasProcessedStripeEvent(eventId)).toBe(true);
  });

  it("E: stale processing reclaim is single-winner", async () => {
    const eventId = `evt_final_e_${Date.now()}`;
    await claimStripeEventForProcessing(eventId, "invoice.paid");
    expireWebhookClaimLeaseForTests(eventId);

    const [a, b] = await Promise.all([
      claimStripeEventForProcessing(eventId, "invoice.paid"),
      claimStripeEventForProcessing(eventId, "invoice.paid"),
    ]);
    const winners = [a, b].filter((r) => r.ok && r.claimed);
    expect(winners).toHaveLength(1);
  });

  it("F: completed event replay → duplicate ack (not reclaimable)", async () => {
    const eventId = `evt_final_f_${Date.now()}`;
    await claimStripeEventForProcessing(eventId, "invoice.paid");
    await markStripeEventProcessed(eventId, "invoice.paid");

    const replay = await claimStripeEventForProcessing(eventId, "invoice.paid");
    expect(replay).toEqual({
      ok: true,
      claimed: false,
      reason: "duplicate",
    });
    expect(await hasProcessedStripeEvent(eventId)).toBe(true);
  });

  it("G: invoice.payment_failed recovery after crash/reclaim", async () => {
    const { applySubscriptionFromStripe } = await import(
      "../subscriptions/service"
    );
    await applySubscriptionFromStripe({
      userId: "user_final_g",
      stripeCustomerId: "cus_final_g",
      stripeSubscriptionId: "sub_final_g",
      planId: "premium",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const eventId = `evt_final_g_${Date.now()}`;
    const claim1 = await claimStripeEventForProcessing(
      eventId,
      "invoice.payment_failed",
    );
    expect(claim1.ok && claim1.claimed).toBe(true);
    // Crash before handler.
    expireWebhookClaimLeaseForTests(eventId);

    const claim2 = await claimStripeEventForProcessing(
      eventId,
      "invoice.payment_failed",
    );
    expect(claim2.ok && claim2.claimed).toBe(true);

    const result = await handleStripeWebhookEvent(
      buildEvent(
        "invoice.payment_failed",
        {
          customer: "cus_final_g",
          subscription: "sub_final_g",
        },
        eventId,
      ),
    );
    expect(result.success).toBe(true);
    await markStripeEventProcessed(eventId, "invoice.payment_failed");

    const view = getUserSubscriptionView("user_final_g");
    expect(view.paymentFailureGraceEndsAt).toBeTruthy();
    expect(await hasProcessedStripeEvent(eventId)).toBe(true);
  });

  it("H: customer.subscription.deleted recovery after crash/reclaim", async () => {
    const { applySubscriptionFromStripe } = await import(
      "../subscriptions/service"
    );
    await applySubscriptionFromStripe({
      userId: "user_final_h",
      stripeCustomerId: "cus_final_h",
      stripeSubscriptionId: "sub_final_h",
      planId: "light",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const eventId = `evt_final_h_${Date.now()}`;
    await claimStripeEventForProcessing(
      eventId,
      "customer.subscription.deleted",
    );
    expireWebhookClaimLeaseForTests(eventId);

    const reclaim = await claimStripeEventForProcessing(
      eventId,
      "customer.subscription.deleted",
    );
    expect(reclaim.ok && reclaim.claimed).toBe(true);

    const result = await handleStripeWebhookEvent(
      buildEvent(
        "customer.subscription.deleted",
        {
          id: "sub_final_h",
          customer: "cus_final_h",
          metadata: { userId: "user_final_h", planId: "light" },
          items: { data: [] },
          status: "canceled",
        },
        eventId,
      ),
    );
    expect(result.success).toBe(true);
    await markStripeEventProcessed(eventId, "customer.subscription.deleted");

    const view = getUserSubscriptionView("user_final_h");
    expect(view.planId).toBe("free");
    expect(view.automationsSuspended).toBe(true);
  });

  it("H2: production without billing supabase fails closed (503 path)", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    // Ensure no service-role client path.
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    const { resetBillingDedicatedTableReadyCache } = await import(
      "../subscriptions/table-ready"
    );
    resetBillingDedicatedTableReadyCache();

    const result = await claimStripeEventForProcessing(
      `evt_final_h2_${Date.now()}`,
      "invoice.paid",
    );
    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });

  it("source: durable claim helper is not used from persistence hot path", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "lib/billing/subscriptions/persistence.ts",
      "utf8",
    );
    expect(src).not.toContain("claimWebhookEventInDurable(");
    expect(src).toContain("isAtlasProduction()");
    expect(src).toContain("lease_expires_at");
  });
});

import { beforeEach, describe, expect, it } from "vitest";

import { recordStripeWebhookLog } from "./telemetry";
import { buildStripeWebhookMonitoringSnapshot } from "./telemetry";
import { resetStripeWebhookLogStore } from "./store";

describe("stripe webhook monitoring", () => {
  beforeEach(() => {
    resetStripeWebhookLogStore();
  });

  it("computes success rate and failure count", () => {
    recordStripeWebhookLog({
      stripeEventId: "evt_1",
      eventType: "checkout.session.completed",
      status: "success",
      message: "ok",
    });
    recordStripeWebhookLog({
      stripeEventId: "evt_2",
      eventType: "invoice.payment_failed",
      status: "failure",
      message: "missing user",
    });

    const snapshot = buildStripeWebhookMonitoringSnapshot();
    expect(snapshot.totalCount).toBe(2);
    expect(snapshot.failureCount).toBe(1);
    expect(snapshot.successRatePercent).toBe(50);
    expect(snapshot.failureCount).toBe(1);
    expect(snapshot.successCount).toBe(1);
    expect(["checkout.session.completed", "invoice.payment_failed"]).toContain(
      snapshot.latestWebhook?.eventType,
    );
    expect(snapshot.availability).toBe("ok");
    expect(snapshot.authoritative).toBe(false);
  });

  it("does not invent 100% success or 0 failures when logs are empty", () => {
    const snapshot = buildStripeWebhookMonitoringSnapshot();
    expect(snapshot.totalCount).toBe(0);
    expect(snapshot.successRatePercent).toBeNull();
    expect(snapshot.failureCount).toBeNull();
    expect(snapshot.availability).toBe("unavailable");
    expect(snapshot.statusMessage).toMatch(/Stripe Dashboard/);
  });

  it("does not double-count the same stripeEventId", () => {
    recordStripeWebhookLog({
      stripeEventId: "evt_dup",
      eventType: "checkout.session.completed",
      status: "success",
      message: "ok",
    });
    recordStripeWebhookLog({
      stripeEventId: "evt_dup",
      eventType: "checkout.session.completed",
      status: "success",
      message: "retry",
    });
    const snapshot = buildStripeWebhookMonitoringSnapshot(new Date(), {
      durableReady: true,
    });
    expect(snapshot.totalCount).toBe(1);
    expect(snapshot.successCount).toBe(1);
  });
});

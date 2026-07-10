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
    expect(snapshot.latestWebhook?.eventType).toBe("invoice.payment_failed");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { processStripeWebhookRequest } from "./webhook";

describe("processStripeWebhookRequest", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 503 when webhook is not configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    const result = await processStripeWebhookRequest("{}", null);
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("Stripe webhook is not configured");
  });

  it("rejects missing signature when configured", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_example");

    const result = await processStripeWebhookRequest(
      JSON.stringify({ id: "evt_1", type: "checkout.session.completed" }),
      null,
    );
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Missing Stripe signature");
  });

  it("rejects invalid signature", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_example");

    const result = await processStripeWebhookRequest("{}", "t=1,v1=bad");
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Invalid Stripe signature");
  });
});

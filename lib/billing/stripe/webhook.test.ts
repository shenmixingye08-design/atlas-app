import { afterEach, describe, expect, it } from "vitest";

import { processStripeWebhookRequest } from "./webhook";

const ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

function snapshotEnv(): Record<(typeof ENV_KEYS)[number], string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof ENV_KEYS)[number],
    string | undefined
  >;
}

function restoreEnv(values: Record<(typeof ENV_KEYS)[number], string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe("processStripeWebhookRequest", () => {
  afterEach(() => {
    // restored per-test
  });

  it("returns 503 when webhook is not configured", async () => {
    const saved = snapshotEnv();
    for (const key of ENV_KEYS) delete process.env[key];

    const result = await processStripeWebhookRequest("{}", null);
    expect(result.status).toBe(503);
    expect(result.body.error).toBe("Stripe webhook is not configured");

    restoreEnv(saved);
  });

  it("rejects missing signature when configured", async () => {
    const saved = snapshotEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_example";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_example";

    const result = await processStripeWebhookRequest(
      JSON.stringify({ id: "evt_1", type: "checkout.session.completed" }),
      null,
    );
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Missing Stripe signature");

    restoreEnv(saved);
  });

  it("rejects invalid signature", async () => {
    const saved = snapshotEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_example";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_example";

    const result = await processStripeWebhookRequest("{}", "t=1,v1=bad");
    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Invalid Stripe signature");

    restoreEnv(saved);
  });
});

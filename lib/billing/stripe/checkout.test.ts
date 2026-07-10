import { afterEach, describe, expect, it } from "vitest";

import {
  resolveAppOrigin,
  resolveCheckoutUrls,
  STRIPE_CHECKOUT_CANCEL_PATH,
  STRIPE_CHECKOUT_SUCCESS_PATH,
} from "./config";
import { createCheckoutSession } from "./checkout";

const ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_PRICE_LIGHT",
  "STRIPE_PRICE_STANDARD",
  "STRIPE_PRICE_PREMIUM",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_URL",
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

describe("stripe checkout config", () => {
  it("builds success and cancel URLs from app origin", () => {
    const urls = resolveCheckoutUrls("https://app.example.com");
    expect(urls.successUrl).toBe(
      `https://app.example.com${STRIPE_CHECKOUT_SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(urls.cancelUrl).toBe(
      `https://app.example.com${STRIPE_CHECKOUT_CANCEL_PATH}`,
    );
  });

  it("prefers NEXT_PUBLIC_APP_URL over request origin", () => {
    const saved = snapshotEnv();
    process.env.NEXT_PUBLIC_APP_URL = "https://atlas.example.com/";

    expect(resolveAppOrigin("http://localhost:3000")).toBe("https://atlas.example.com");

    restoreEnv(saved);
  });
});

describe("createCheckoutSession", () => {
  afterEach(() => {
    // Vitest runs tests in parallel — each test restores its own snapshot in afterEach
  });

  it("rejects Free plan checkout", async () => {
    await expect(
      createCheckoutSession({
        userId: "user_123",
        planId: "free",
        customerEmail: "user@example.com",
        origin: "http://localhost:3000",
      }),
    ).rejects.toThrow("Free plan does not require checkout");
  });

  it("returns mock checkout when Stripe is not configured", async () => {
    const saved = snapshotEnv();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }

    const session = await createCheckoutSession({
      userId: "user_123",
      planId: "light",
      customerEmail: "user@example.com",
      origin: "http://localhost:3000",
    });

    expect(session.mode).toBe("mock");
    expect(session.url).toContain("/billing/success");
    expect(session.url).toContain("plan=light");
    expect(session.url).toContain("mode=mock");

    restoreEnv(saved);
  });

  it("throws when Stripe secret is set but price id is missing", async () => {
    const saved = snapshotEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_example";
    delete process.env.STRIPE_PRICE_LIGHT;

    await expect(
      createCheckoutSession({
        userId: "user_123",
        planId: "light",
        customerEmail: "user@example.com",
        origin: "http://localhost:3000",
      }),
    ).rejects.toThrow("Stripe price is not configured for plan: light");

    restoreEnv(saved);
  });
});

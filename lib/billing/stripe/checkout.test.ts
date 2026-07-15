import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ATLAS_CANONICAL_ORIGIN,
  BILLING_SETTINGS_PATH,
  resolveAppOrigin,
  resolveCheckoutUrls,
  STRIPE_CHECKOUT_SUCCESS_PATH,
} from "./config";
import {
  assertNoDuplicatePaidSubscription,
  assertStripePriceMatchesPlan,
  createCheckoutSession,
  isStripeLiveMode,
} from "./checkout";
import {
  CHECKOUT_ALREADY_SAME_PLAN_MESSAGE,
  CHECKOUT_PRICE_MISMATCH_MESSAGE,
  CHECKOUT_USE_PORTAL_FOR_PLAN_CHANGE_MESSAGE,
  CheckoutBlockedError,
} from "./errors";
import { resetSubscriptionStore, saveUserSubscription } from "../subscriptions/store";

const ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_PRICE_LIGHT",
  "STRIPE_PRICE_STANDARD",
  "STRIPE_PRICE_PREMIUM",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_URL",
  "VERCEL_ENV",
  "NODE_ENV",
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
  it("builds success and cancel URLs from app origin in non-production", () => {
    const saved = snapshotEnv();
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;

    const urls = resolveCheckoutUrls("https://app.example.com");
    expect(urls.successUrl).toBe(
      `https://app.example.com${STRIPE_CHECKOUT_SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(urls.cancelUrl).toBe(
      `https://app.example.com${BILLING_SETTINGS_PATH}?checkout=cancelled`,
    );

    restoreEnv(saved);
  });

  it("pins production checkout URLs to atlasapp.jp (never vercel.app)", () => {
    const saved = snapshotEnv();
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "atlas-something.vercel.app";
    process.env.NEXT_PUBLIC_APP_URL = "https://atlas-something.vercel.app";

    const urls = resolveCheckoutUrls("https://atlas-something.vercel.app");
    expect(urls.successUrl).toBe(
      `${ATLAS_CANONICAL_ORIGIN}${STRIPE_CHECKOUT_SUCCESS_PATH}?session_id={CHECKOUT_SESSION_ID}`,
    );
    expect(urls.cancelUrl).toBe(
      `${ATLAS_CANONICAL_ORIGIN}${BILLING_SETTINGS_PATH}?checkout=cancelled`,
    );
    expect(resolveAppOrigin("https://atlas-something.vercel.app")).toBe(
      ATLAS_CANONICAL_ORIGIN,
    );

    restoreEnv(saved);
  });

  it("prefers NEXT_PUBLIC_APP_URL over request origin outside production", () => {
    const saved = snapshotEnv();
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_APP_URL = "https://atlas.example.com/";

    expect(resolveAppOrigin("http://localhost:3000")).toBe("https://atlas.example.com");

    restoreEnv(saved);
  });
});

describe("isStripeLiveMode", () => {
  it("is true only for sk_live_ secret keys", () => {
    const saved = snapshotEnv();
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_example";
    expect(isStripeLiveMode()).toBe(false);

    process.env.STRIPE_SECRET_KEY = "sk_live_example";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_live_example";
    expect(isStripeLiveMode()).toBe(true);

    delete process.env.STRIPE_SECRET_KEY;
    expect(isStripeLiveMode()).toBe(false);
    restoreEnv(saved);
  });

  it("is true for quoted or BOM-prefixed sk_live_ secrets", () => {
    const saved = snapshotEnv();
    process.env.STRIPE_SECRET_KEY = '"sk_live_example"';
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = '"pk_live_example"';
    expect(isStripeLiveMode()).toBe(true);

    process.env.STRIPE_SECRET_KEY = "\uFEFFsk_live_example";
    expect(isStripeLiveMode()).toBe(true);

    process.env.STRIPE_SECRET_KEY = "'sk_test_example'";
    expect(isStripeLiveMode()).toBe(false);
    restoreEnv(saved);
  });
});

describe("createCheckoutSession", () => {
  beforeEach(() => {
    resetSubscriptionStore();
  });

  afterEach(() => {
    resetSubscriptionStore();
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

  it("blocks checkout when the same paid plan is already active", async () => {
    const saved = snapshotEnv();
    for (const key of ENV_KEYS) delete process.env[key];

    const now = new Date().toISOString();
    saveUserSubscription({
      userId: "user_dup_same",
      stripeCustomerId: "cus_dup",
      stripeSubscriptionId: "sub_dup",
      stripePriceId: "price_light",
      planId: "light",
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: now,
    });

    await expect(
      createCheckoutSession({
        userId: "user_dup_same",
        planId: "light",
        origin: "http://localhost:3000",
      }),
    ).rejects.toBeInstanceOf(CheckoutBlockedError);

    await expect(
      createCheckoutSession({
        userId: "user_dup_same",
        planId: "light",
        origin: "http://localhost:3000",
      }),
    ).rejects.toThrow(CHECKOUT_ALREADY_SAME_PLAN_MESSAGE);

    restoreEnv(saved);
  });

  it("blocks checkout for a different paid plan and guides to portal", async () => {
    const saved = snapshotEnv();
    for (const key of ENV_KEYS) delete process.env[key];

    const now = new Date().toISOString();
    saveUserSubscription({
      userId: "user_dup_other",
      stripeCustomerId: "cus_other",
      stripeSubscriptionId: "sub_other",
      stripePriceId: "price_standard",
      planId: "standard",
      status: "trialing",
      currentPeriodStart: now,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      updatedAt: now,
    });

    await expect(
      createCheckoutSession({
        userId: "user_dup_other",
        planId: "premium",
        origin: "http://localhost:3000",
      }),
    ).rejects.toThrow(CHECKOUT_USE_PORTAL_FOR_PLAN_CHANGE_MESSAGE);

    restoreEnv(saved);
  });
});

describe("assertNoDuplicatePaidSubscription", () => {
  beforeEach(() => {
    resetSubscriptionStore();
  });

  it("allows checkout when user is on free", async () => {
    await expect(
      assertNoDuplicatePaidSubscription({
        userId: "user_free",
        planId: "light",
        stripe: null,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("assertStripePriceMatchesPlan retrieve errors", () => {
  it("logs Stripe error diagnostics and throws price_mismatch on retrieve failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const retrieveError = Object.assign(new Error("No such price: 'price_bad'"), {
      type: "StripeInvalidRequestError",
      code: "resource_missing",
      statusCode: 404,
    });
    const stripe = {
      prices: {
        retrieve: vi.fn().mockRejectedValue(retrieveError),
      },
    };

    await expect(
      assertStripePriceMatchesPlan(
        stripe as never,
        "price_bad",
        "light",
      ),
    ).rejects.toMatchObject({
      name: "CheckoutBlockedError",
      code: "price_mismatch",
      userMessage: CHECKOUT_PRICE_MISMATCH_MESSAGE,
    });

    expect(stripe.prices.retrieve).toHaveBeenCalledWith("price_bad");

    const retrieveFailLog = errorSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("Stripe prices.retrieve failed"),
    );
    expect(retrieveFailLog).toBeDefined();
    expect(retrieveFailLog?.[1]).toMatchObject({
      planId: "light",
      priceId: "price_bad",
      stripeErrorType: "StripeInvalidRequestError",
      stripeErrorCode: "resource_missing",
      stripeStatusCode: 404,
      stripeErrorMessage: "No such price: 'price_bad'",
      stripeAmount: null,
      stripeCurrency: null,
      stripeInterval: null,
      resourceMissing: true,
      expectedAmount: 980,
    });

    errorSpy.mockRestore();
  });

  it("throws price_mismatch when retrieved amount does not match registry", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stripe = {
      prices: {
        retrieve: vi.fn().mockResolvedValue({
          id: "price_light",
          currency: "jpy",
          unit_amount: 999,
          type: "recurring",
          recurring: { interval: "month" },
        }),
      },
    };

    await expect(
      assertStripePriceMatchesPlan(stripe as never, "price_light", "light"),
    ).rejects.toBeInstanceOf(CheckoutBlockedError);

    const afterRetrieve = errorSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("price_mismatch after retrieve"),
    );
    expect(afterRetrieve?.[1]).toMatchObject({
      reason: "amount_mismatch",
      stripeAmount: 999,
      expectedAmount: 980,
    });

    errorSpy.mockRestore();
  });
});

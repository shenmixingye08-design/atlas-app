import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertStripeSafeForProduction,
  assertStripeWebhookSafeForProduction,
  hasStripeKeyModeMismatch,
  usesStripeLiveSecretKey,
  usesStripeTestKeys,
} from "./production-guard";

describe("stripe production guard", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects test keys and live secret", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_abc");
    expect(usesStripeTestKeys()).toBe(true);
    expect(usesStripeLiveSecretKey()).toBe(false);

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_abc");
    expect(usesStripeTestKeys()).toBe(false);
    expect(usesStripeLiveSecretKey()).toBe(true);
  });

  it("detects live/test key mode mismatch", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_abc");
    expect(hasStripeKeyModeMismatch()).toBe(true);
  });

  it("rejects test keys in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_abc");

    expect(() => assertStripeSafeForProduction()).toThrow(/test keys/);
  });

  it("rejects missing webhook secret in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_abc");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    expect(() => assertStripeWebhookSafeForProduction()).toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    );
  });

  it("allows live keys with webhook secret in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_live_abc");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_abc");

    expect(() => assertStripeWebhookSafeForProduction()).not.toThrow();
  });
});

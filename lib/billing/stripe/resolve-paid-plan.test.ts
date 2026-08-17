import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolvePaidPlanFromStripeRefs } from "./resolve-paid-plan";

describe("resolvePaidPlanFromStripeRefs", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("STRIPE_PRICE_LIGHT", "price_light_allow");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard_allow");
    vi.stubEnv("STRIPE_PRICE_PREMIUM", "price_premium_allow");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allowlisted Price ID wins over conflicting metadata", () => {
    const resolved = resolvePaidPlanFromStripeRefs({
      priceId: "price_light_allow",
      metadataPlanId: "premium",
    });
    expect(resolved).toMatchObject({
      planId: "light",
      source: "price",
      conflict: true,
      unknownPrice: false,
    });
  });

  it("unknown Price ID is fail-closed and ignores metadata", () => {
    const resolved = resolvePaidPlanFromStripeRefs({
      priceId: "price_attacker_forged",
      metadataPlanId: "premium",
    });
    expect(resolved).toMatchObject({
      planId: null,
      source: "none",
      unknownPrice: true,
    });
  });

  it("uses metadata only when Stripe attached no Price ID", () => {
    const resolved = resolvePaidPlanFromStripeRefs({
      priceId: null,
      metadataPlanId: "standard",
    });
    expect(resolved).toMatchObject({
      planId: "standard",
      source: "metadata",
      unknownPrice: false,
    });
  });

  it("never grants Free from metadata", () => {
    expect(
      resolvePaidPlanFromStripeRefs({
        priceId: null,
        metadataPlanId: "free",
      }).planId,
    ).toBeNull();
  });
});

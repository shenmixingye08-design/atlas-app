import { describe, expect, it } from "vitest";

import {
  CHECKOUT_CONFIG_USER_ERROR_MESSAGE,
  CHECKOUT_USER_ERROR_MESSAGE,
  CheckoutBlockedError,
  CHECKOUT_ALREADY_SAME_PLAN_MESSAGE,
  CHECKOUT_PRICE_MISMATCH_MESSAGE,
  classifyCheckoutRouteError,
} from "./errors";

describe("classifyCheckoutRouteError", () => {
  it("maps already_same_plan blocked checkout to 409", () => {
    const error = new CheckoutBlockedError(
      "already_same_plan",
      CHECKOUT_ALREADY_SAME_PLAN_MESSAGE,
    );
    const result = classifyCheckoutRouteError(error);
    expect(result.status).toBe(409);
    expect(result.code).toBe("already_same_plan");
    expect(result.userMessage).toBe(CHECKOUT_ALREADY_SAME_PLAN_MESSAGE);
  });

  it("maps price_mismatch to 400 (not 409 conflict)", () => {
    const error = new CheckoutBlockedError(
      "price_mismatch",
      CHECKOUT_PRICE_MISMATCH_MESSAGE,
    );
    const result = classifyCheckoutRouteError(error);
    expect(result.status).toBe(400);
    expect(result.code).toBe("price_mismatch");
    expect(result.userMessage).toBe(CHECKOUT_PRICE_MISMATCH_MESSAGE);
  });

  it("maps missing publishable/secret keys to 503 stripe_not_configured", () => {
    const result = classifyCheckoutRouteError(
      new Error(
        "STRIPE_SECRET_KEY and NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be set in production",
      ),
    );
    expect(result.status).toBe(503);
    expect(result.code).toBe("stripe_not_configured");
    expect(result.userMessage).toBe(CHECKOUT_CONFIG_USER_ERROR_MESSAGE);
  });

  it("maps test keys in production to 503 stripe_unsafe_keys", () => {
    const result = classifyCheckoutRouteError(
      new Error(
        "Stripe test keys (sk_test_ / pk_test_) must not be used in production",
      ),
    );
    expect(result.status).toBe(503);
    expect(result.code).toBe("stripe_unsafe_keys");
  });

  it("maps missing price id to 503 stripe_price_missing", () => {
    const result = classifyCheckoutRouteError(
      new Error("Stripe price is not configured for plan: light"),
    );
    expect(result.status).toBe(503);
    expect(result.code).toBe("stripe_price_missing");
  });

  it("maps unknown failures to 500 checkout_failed", () => {
    const result = classifyCheckoutRouteError(new Error("Stripe API timeout"));
    expect(result.status).toBe(500);
    expect(result.code).toBe("checkout_failed");
    expect(result.userMessage).toBe(CHECKOUT_USER_ERROR_MESSAGE);
  });
});

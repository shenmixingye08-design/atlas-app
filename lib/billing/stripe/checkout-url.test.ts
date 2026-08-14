import { describe, expect, it } from "vitest";

import { checkoutUrlKind, isAssignableCheckoutUrl } from "./checkout-url";

describe("isAssignableCheckoutUrl", () => {
  it("accepts Stripe hosted Checkout and Portal https URLs", () => {
    expect(
      isAssignableCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test_123"),
    ).toBe(true);
    expect(
      isAssignableCheckoutUrl("https://billing.stripe.com/p/session/live_abc"),
    ).toBe(true);
    expect(checkoutUrlKind("https://checkout.stripe.com/c/pay/cs_live_1")).toBe(
      "stripe_checkout",
    );
  });

  it("accepts relative mock success paths only", () => {
    expect(isAssignableCheckoutUrl("/billing/success?session_id=mock_cs_1")).toBe(
      true,
    );
    expect(isAssignableCheckoutUrl("/settings/billing?portal=mock")).toBe(true);
    expect(checkoutUrlKind("/billing/success?mode=mock")).toBe("mock");
  });

  it("rejects empty, non-https, and non-Stripe hosts", () => {
    expect(isAssignableCheckoutUrl(null)).toBe(false);
    expect(isAssignableCheckoutUrl(undefined)).toBe(false);
    expect(isAssignableCheckoutUrl("")).toBe(false);
    expect(isAssignableCheckoutUrl("   ")).toBe(false);
    expect(isAssignableCheckoutUrl("http://checkout.stripe.com/c/pay/x")).toBe(
      false,
    );
    expect(isAssignableCheckoutUrl("https://evil.example/checkout")).toBe(false);
    expect(isAssignableCheckoutUrl("javascript:alert(1)")).toBe(false);
    expect(
      isAssignableCheckoutUrl("https://atlasapp.jp/billing/success?mode=mock"),
    ).toBe(false);
  });
});

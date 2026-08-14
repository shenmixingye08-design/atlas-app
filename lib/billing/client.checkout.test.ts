import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckoutRequestError, startCheckout } from "./client";

describe("startCheckout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("assigns only a Stripe-hosted https URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            url: "https://checkout.stripe.com/c/pay/cs_live_abc",
            sessionId: "cs_live_abc",
            mode: "live",
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await startCheckout("light");
    expect(result.url).toBe("https://checkout.stripe.com/c/pay/cs_live_abc");
    expect(result.mode).toBe("live");
    expect(fetch).toHaveBeenCalledWith(
      "/api/billing/checkout",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ planId: "light" }),
      }),
    );
  });

  it("refuses empty or non-Stripe URLs even on HTTP 200", async () => {
    const badUrls = [
      "",
      "http://checkout.stripe.com/c/pay/x",
      "javascript:alert(1)",
      "https://evil.example/checkout",
    ];

    for (const url of badUrls) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({ url, sessionId: "cs_x", mode: "live" }),
            { status: 200 },
          ),
        ),
      );

      await expect(startCheckout("standard")).rejects.toMatchObject({
        name: "CheckoutRequestError",
        code: "invalid_checkout_url",
      });
    }
  });

  it("surfaces checkout error codes including portal guidance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "別の有料プランをご契約中です",
            code: "use_portal_for_plan_change",
          }),
          { status: 409 },
        ),
      ),
    );

    try {
      await startCheckout("premium");
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(CheckoutRequestError);
      expect((error as CheckoutRequestError).code).toBe(
        "use_portal_for_plan_change",
      );
      expect((error as CheckoutRequestError).status).toBe(409);
    }
  });
});

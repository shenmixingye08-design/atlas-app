import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHECKOUT_ALREADY_SAME_PLAN_MESSAGE } from "./errors";

const { getStripeClient } = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
}));

vi.mock("./client", () => ({
  getStripeClient,
}));

import {
  buildSubscriptionUpdateConfirmFlowData,
  createBillingPortalSession,
} from "./checkout";

const ENV_KEYS = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_PRICE_LIGHT",
  "STRIPE_PRICE_STANDARD",
  "STRIPE_PRICE_PREMIUM",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL_ENV",
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

describe("buildSubscriptionUpdateConfirmFlowData", () => {
  it("asks Stripe for subscription_update_confirm with quantity 1", () => {
    expect(
      buildSubscriptionUpdateConfirmFlowData({
        subscriptionId: "sub_light",
        subscriptionItemId: "si_light",
        targetPriceId: "price_standard_sot",
        returnUrl: "https://atlasapp.jp/settings/billing",
      }),
    ).toEqual({
      type: "subscription_update_confirm",
      after_completion: {
        type: "redirect",
        redirect: { return_url: "https://atlasapp.jp/settings/billing" },
      },
      subscription_update_confirm: {
        subscription: "sub_light",
        items: [
          {
            id: "si_light",
            price: "price_standard_sot",
            quantity: 1,
          },
        ],
      },
    });
  });
});

describe("createBillingPortalSession", () => {
  let saved: ReturnType<typeof snapshotEnv>;

  beforeEach(() => {
    saved = snapshotEnv();
    getStripeClient.mockReset();
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_example";
    process.env.STRIPE_PRICE_LIGHT = "price_light_sot";
    process.env.STRIPE_PRICE_STANDARD = "price_standard_sot";
    process.env.STRIPE_PRICE_PREMIUM = "price_premium_sot";
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    restoreEnv(saved);
    getStripeClient.mockReset();
  });

  it("opens portal home with no flow_data when targetPlanId is omitted", async () => {
    const create = vi.fn().mockResolvedValue({
      url: "https://billing.stripe.com/p/session/home",
    });
    const retrieve = vi.fn();
    const list = vi.fn();
    const checkoutCreate = vi.fn();
    getStripeClient.mockReturnValue({
      billingPortal: { sessions: { create } },
      subscriptions: { retrieve, list },
      checkout: { sessions: { create: checkoutCreate } },
    });

    const result = await createBillingPortalSession({
      stripeCustomerId: "cus_light",
      origin: "https://atlasapp.jp",
    });

    expect(result).toEqual({
      url: "https://billing.stripe.com/p/session/home",
      mode: "live",
      flow: "portal_home",
    });
    expect(create).toHaveBeenCalledWith({
      customer: "cus_light",
      return_url: "https://atlasapp.jp/settings/billing",
    });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("flow_data");
    expect(retrieve).not.toHaveBeenCalled();
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("opens subscription_update_confirm for Light → Standard using SoT price", async () => {
    const create = vi.fn().mockResolvedValue({
      url: "https://billing.stripe.com/p/session/confirm_standard",
    });
    const retrieve = vi.fn().mockResolvedValue({
      id: "sub_light",
      status: "active",
      items: {
        data: [{ id: "si_light", price: { id: "price_light_sot" } }],
      },
    });
    const checkoutCreate = vi.fn();
    getStripeClient.mockReturnValue({
      billingPortal: { sessions: { create } },
      subscriptions: { retrieve, list: vi.fn() },
      checkout: { sessions: { create: checkoutCreate } },
    });

    const result = await createBillingPortalSession({
      stripeCustomerId: "cus_light",
      origin: "https://atlasapp.jp",
      targetPlanId: "standard",
      stripeSubscriptionId: "sub_light",
      currentPlanId: "light",
    });

    expect(result.flow).toBe("subscription_update_confirm");
    expect(result.url).toBe(
      "https://billing.stripe.com/p/session/confirm_standard",
    );
    expect(retrieve).toHaveBeenCalledWith("sub_light");
    expect(create).toHaveBeenCalledWith({
      customer: "cus_light",
      return_url: "https://atlasapp.jp/settings/billing",
      flow_data: buildSubscriptionUpdateConfirmFlowData({
        subscriptionId: "sub_light",
        subscriptionItemId: "si_light",
        targetPriceId: "price_standard_sot",
        returnUrl: "https://atlasapp.jp/settings/billing",
      }),
    });
    expect(checkoutCreate).not.toHaveBeenCalled();
  });

  it("resolves Premium the same way and never starts Checkout", async () => {
    const create = vi.fn().mockResolvedValue({
      url: "https://billing.stripe.com/p/session/confirm_premium",
    });
    getStripeClient.mockReturnValue({
      billingPortal: { sessions: { create } },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: "sub_light",
          status: "active",
          items: {
            data: [{ id: "si_light", price: { id: "price_light_sot" } }],
          },
        }),
        list: vi.fn(),
      },
      checkout: { sessions: { create: vi.fn() } },
    });

    const result = await createBillingPortalSession({
      stripeCustomerId: "cus_light",
      origin: "https://atlasapp.jp",
      targetPlanId: "premium",
      stripeSubscriptionId: "sub_light",
      currentPlanId: "light",
    });

    expect(result.flow).toBe("subscription_update_confirm");
    expect(create.mock.calls[0]?.[0].flow_data.subscription_update_confirm.items[0]).toEqual({
      id: "si_light",
      price: "price_premium_sot",
      quantity: 1,
    });
    expect(
      getStripeClient.mock.results[0]?.value.checkout.sessions.create,
    ).not.toHaveBeenCalled();
  });

  it("does nothing useful for the same plan", async () => {
    const create = vi.fn();
    getStripeClient.mockReturnValue({
      billingPortal: { sessions: { create } },
      checkout: { sessions: { create: vi.fn() } },
    });

    await expect(
      createBillingPortalSession({
        stripeCustomerId: "cus_light",
        origin: "https://atlasapp.jp",
        targetPlanId: "light",
        stripeSubscriptionId: "sub_light",
        currentPlanId: "light",
      }),
    ).rejects.toMatchObject({
      name: "CheckoutBlockedError",
      code: "already_same_plan",
      userMessage: CHECKOUT_ALREADY_SAME_PLAN_MESSAGE,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("fails closed when the subscription has no single item — no portal home fallback", async () => {
    const create = vi.fn();
    getStripeClient.mockReturnValue({
      billingPortal: { sessions: { create } },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: "sub_light",
          status: "active",
          items: { data: [] },
        }),
        list: vi.fn(),
      },
    });

    await expect(
      createBillingPortalSession({
        stripeCustomerId: "cus_light",
        origin: "https://atlasapp.jp",
        targetPlanId: "standard",
        stripeSubscriptionId: "sub_light",
        currentPlanId: "light",
      }),
    ).rejects.toThrow(/single item/);
    expect(create).not.toHaveBeenCalled();
  });

  it("lists the live subscription when the stored id is missing", async () => {
    const create = vi.fn().mockResolvedValue({
      url: "https://billing.stripe.com/p/session/confirm_standard",
    });
    const list = vi.fn().mockResolvedValue({
      data: [
        {
          id: "sub_from_list",
          status: "active",
          items: {
            data: [{ id: "si_from_list", price: { id: "price_light_sot" } }],
          },
        },
      ],
    });
    getStripeClient.mockReturnValue({
      billingPortal: { sessions: { create } },
      subscriptions: { retrieve: vi.fn(), list },
    });

    await createBillingPortalSession({
      stripeCustomerId: "cus_light",
      origin: "https://atlasapp.jp",
      targetPlanId: "standard",
      stripeSubscriptionId: null,
      currentPlanId: "light",
    });

    expect(list).toHaveBeenCalledWith({
      customer: "cus_light",
      status: "all",
      limit: 20,
    });
    expect(create.mock.calls[0]?.[0].flow_data.subscription_update_confirm).toMatchObject({
      subscription: "sub_from_list",
      items: [{ id: "si_from_list", price: "price_standard_sot", quantity: 1 }],
    });
  });
});

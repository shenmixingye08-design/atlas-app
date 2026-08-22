import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchStripeLiveMonthMetrics } from "./stripe-live-metrics";
import { fetchStripeSubscriptionLiveMetrics } from "./stripe-subscription-metrics";

afterEach(() => {
  vi.unstubAllEnvs();
});

function invoicePages(total: number, amount: number, currency = "jpy") {
  return async (params: { starting_after?: string }) => {
    const start = params.starting_after
      ? Number(String(params.starting_after).replace("in_", "")) + 1
      : 0;
    const data = Array.from({ length: Math.min(100, total - start) }, (_, i) => ({
      id: `in_${start + i}`,
      currency,
      amount_paid: amount,
    }));
    return { data, has_more: start + data.length < total };
  };
}

describe("stripe live month metrics", () => {
  it("computes 980円 × 2 users deterministically", async () => {
    const stripe = {
      invoices: { list: invoicePages(2, 980) },
      refunds: {
        list: async () => ({ data: [], has_more: false }),
      },
      balanceTransactions: {
        list: async () => ({
          data: [
            { id: "txn_1", currency: "jpy", fee: 36 },
            { id: "txn_2", currency: "jpy", fee: 36 },
          ],
          has_more: false,
        }),
      },
      payouts: { list: async () => ({ data: [] }) },
    };

    const metrics = await fetchStripeLiveMonthMetrics(
      new Date("2026-08-15T00:00:00.000Z"),
      stripe,
    );
    expect(metrics.availability).toBe("ok");
    expect(metrics.grossRevenue).toBe(1960);
    expect(metrics.refunds).toBe(0);
    expect(metrics.fees).toBe(72);
    expect(metrics.netRevenue).toBe(1888);
  });

  it("does not present a truncated invoice list as a complete total", async () => {
    const stripe = {
      invoices: {
        list: async () => ({
          data: Array.from({ length: 100 }, (_, i) => ({
            id: `in_${i}`,
            currency: "jpy",
            amount_paid: 980,
          })),
          has_more: true,
        }),
      },
      refunds: { list: async () => ({ data: [], has_more: false }) },
      balanceTransactions: { list: async () => ({ data: [], has_more: false }) },
      payouts: { list: async () => ({ data: [] }) },
    };

    const originalMax = await import("./stripe-paginate");
    const metrics = await fetchStripeLiveMonthMetrics(
      new Date("2026-08-15T00:00:00.000Z"),
      {
        ...stripe,
        invoices: {
          list: async (params: { starting_after?: string }) => {
            const start = params.starting_after
              ? Number(String(params.starting_after).replace("in_", "")) + 1
              : 0;
            if (start >= originalMax.STRIPE_PAGINATION_MAX_PAGES * 100) {
              return {
                data: Array.from({ length: 100 }, (_, i) => ({
                  id: `in_${start + i}`,
                  currency: "jpy",
                  amount_paid: 980,
                })),
                has_more: true,
              };
            }
            return {
              data: Array.from({ length: 100 }, (_, i) => ({
                id: `in_${start + i}`,
                currency: "jpy",
                amount_paid: 980,
              })),
              has_more: true,
            };
          },
        },
      },
    );
    expect(metrics.availability).toBe("incomplete");
    expect(metrics.grossRevenue).toBeNull();
    expect(metrics.statusMessage).toMatch(/未完了/);
  });

  it("does not disguise a Stripe failure as 0円", async () => {
    const stripe = {
      invoices: {
        list: async () => {
          throw new Error("stripe down");
        },
      },
      refunds: { list: async () => ({ data: [], has_more: false }) },
      balanceTransactions: { list: async () => ({ data: [], has_more: false }) },
      payouts: { list: async () => ({ data: [] }) },
    };
    const metrics = await fetchStripeLiveMonthMetrics(new Date(), stripe);
    expect(metrics.availability).toBe("failed");
    expect(metrics.grossRevenue).toBeNull();
    expect(metrics.refunds).toBeNull();
    expect(metrics.fees).toBeNull();
    expect(metrics.netRevenue).toBeNull();
  });
});

describe("stripe subscription live metrics", () => {
  it("counts only allowlisted active/trialing as paid", async () => {
    vi.stubEnv("STRIPE_PRICE_LIGHT", "price_light");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard");
    vi.stubEnv("STRIPE_PRICE_PREMIUM", "price_premium");

    const stripe = {
      subscriptions: {
        list: async () => ({
          data: [
            {
              id: "sub_1",
              status: "active",
              items: { data: [{ price: { id: "price_light" } }] },
            },
            {
              id: "sub_2",
              status: "trialing",
              items: { data: [{ price: { id: "price_standard" } }] },
            },
            {
              id: "sub_free_unmapped",
              status: "active",
              items: { data: [{ price: { id: "price_other" } }] },
            },
            {
              id: "sub_canceled",
              status: "canceled",
              items: { data: [{ price: { id: "price_light" } }] },
            },
          ],
          has_more: false,
        }),
      },
    };

    const result = await fetchStripeSubscriptionLiveMetrics(stripe);
    expect(result.availability).toBe("ok");
    expect(result.metrics?.paidSubscribers).toBe(2);
    expect(result.metrics?.freeSubscribers).toBe(0);
  });

  it("does not report paid=0 when Stripe listing fails", async () => {
    const stripe = {
      subscriptions: {
        list: async () => {
          throw new Error("stripe down");
        },
      },
    };
    const result = await fetchStripeSubscriptionLiveMetrics(stripe);
    expect(result.availability).toBe("failed");
    expect(result.metrics).toBeNull();
    expect(result.cancelScheduledCount).toBeNull();
  });
});

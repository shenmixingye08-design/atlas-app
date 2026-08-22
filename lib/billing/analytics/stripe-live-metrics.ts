import "server-only";

import { getStripeClient } from "../stripe/client";
import { getStripeSecretKey, isStripeConfigured } from "../stripe/config";

import type { OwnerStripeMode } from "@/lib/owner/types";

import { paginateStripeList } from "./stripe-paginate";

export type StripeLiveMonthMetrics = {
  connected: boolean;
  mode: OwnerStripeMode | null;
  availability: "ok" | "disconnected" | "failed" | "incomplete";
  statusMessage: string | null;
  updateFailed: boolean;
  fetchedAt: string | null;
  /** Gross paid invoice amount this calendar month (minor units → major). */
  grossRevenue: number | null;
  refunds: number | null;
  fees: number | null;
  netRevenue: number | null;
  currency: string;
  upcomingPayoutAmount: number | null;
  upcomingPayoutAt: string | null;
  upcomingPayoutStatus: "scheduled" | "pending" | "paid" | "unknown" | null;
};

function resolveStripeMode(secretKey: string | null): OwnerStripeMode | null {
  if (!secretKey) return null;
  if (secretKey.startsWith("sk_live_")) return "live";
  if (secretKey.startsWith("sk_test_")) return "test";
  return null;
}

function monthWindowUnix(now: Date): { gte: number; lt: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return {
    gte: Math.floor(start.getTime() / 1000),
    lt: Math.floor(end.getTime() / 1000),
  };
}

function fromMinor(amount: number, currency: string): number {
  if (currency.toLowerCase() === "jpy") return amount;
  return amount / 100;
}

type StripeListClient = {
  invoices: {
    list: (params: Record<string, unknown>) => Promise<{
      data: Array<{
        id: string;
        currency?: string;
        amount_paid?: number;
      }>;
      has_more: boolean;
    }>;
  };
  refunds: {
    list: (params: Record<string, unknown>) => Promise<{
      data: Array<{
        id: string;
        currency?: string;
        amount?: number;
        status?: string;
      }>;
      has_more: boolean;
    }>;
  };
  balanceTransactions: {
    list: (params: Record<string, unknown>) => Promise<{
      data: Array<{ id: string; currency?: string; fee?: number }>;
      has_more: boolean;
    }>;
  };
  payouts: {
    list: (params: Record<string, unknown>) => Promise<{
      data: Array<{
        amount: number;
        currency: string;
        arrival_date: number;
        status: string;
      }>;
    }>;
  };
};

/**
 * Pull month-to-date Stripe cash metrics from the configured secret key.
 * Never invents amounts — disconnected / failed / incomplete leave numeric fields null.
 */
export async function fetchStripeLiveMonthMetrics(
  now: Date = new Date(),
  clientOverride?: StripeListClient | null,
): Promise<StripeLiveMonthMetrics> {
  const secret = getStripeSecretKey();
  const mode = resolveStripeMode(secret);
  const empty = (
    partial: Partial<StripeLiveMonthMetrics>,
  ): StripeLiveMonthMetrics => ({
    connected: false,
    mode,
    availability: "disconnected",
    statusMessage: "Stripe未接続",
    updateFailed: false,
    fetchedAt: null,
    grossRevenue: null,
    refunds: null,
    fees: null,
    netRevenue: null,
    currency: "jpy",
    upcomingPayoutAmount: null,
    upcomingPayoutAt: null,
    upcomingPayoutStatus: null,
    ...partial,
  });

  if (!clientOverride && !isStripeConfigured()) {
    return empty({
      statusMessage: "本番キーとWebhook設定が必要です",
    });
  }

  const stripe = clientOverride ?? (getStripeClient() as StripeListClient | null);
  if (!stripe) {
    return empty({
      statusMessage: "Stripe未接続",
    });
  }

  const { gte, lt } = monthWindowUnix(now);
  const fetchedAt = now.toISOString();

  try {
    let currency = "jpy";

    const invoices = await paginateStripeList((startingAfter) =>
      stripe.invoices.list({
        status: "paid",
        created: { gte, lt },
        limit: 100,
        starting_after: startingAfter,
      }),
    );

    let grossRevenue = 0;
    for (const invoice of invoices.items) {
      currency = invoice.currency || currency;
      grossRevenue += fromMinor(invoice.amount_paid ?? 0, invoice.currency ?? currency);
    }

    const refundPage = await paginateStripeList((startingAfter) =>
      stripe.refunds.list({
        created: { gte, lt },
        limit: 100,
        starting_after: startingAfter,
      }),
    );
    let refunds = 0;
    for (const refund of refundPage.items) {
      if (refund.status === "failed" || refund.status === "canceled") continue;
      currency = refund.currency || currency;
      refunds += fromMinor(refund.amount ?? 0, refund.currency ?? currency);
    }

    const feePage = await paginateStripeList((startingAfter) =>
      stripe.balanceTransactions.list({
        created: { gte, lt },
        limit: 100,
        starting_after: startingAfter,
      }),
    );
    let fees = 0;
    for (const tx of feePage.items) {
      currency = tx.currency || currency;
      fees += fromMinor(Math.abs(tx.fee ?? 0), tx.currency ?? currency);
    }

    const incomplete =
      !invoices.complete || !refundPage.complete || !feePage.complete;
    const incompleteReason = invoices.reason ?? refundPage.reason ?? feePage.reason;

    let upcomingPayoutAmount: number | null = null;
    let upcomingPayoutAt: string | null = null;
    let upcomingPayoutStatus: StripeLiveMonthMetrics["upcomingPayoutStatus"] =
      null;

    try {
      const payouts = await stripe.payouts.list({ limit: 5 });
      const upcoming =
        payouts.data.find((p) => p.status === "pending" || p.status === "in_transit") ??
        payouts.data[0] ??
        null;
      if (upcoming) {
        upcomingPayoutAmount = fromMinor(upcoming.amount, upcoming.currency);
        upcomingPayoutAt = new Date(upcoming.arrival_date * 1000).toISOString();
        upcomingPayoutStatus =
          upcoming.status === "paid"
            ? "paid"
            : upcoming.status === "pending" || upcoming.status === "in_transit"
              ? "pending"
              : "unknown";
      }
    } catch {
      // Payouts may be unavailable on some accounts — leave null, not invented.
    }

    const netRevenue = Math.max(0, grossRevenue - refunds - fees);

    if (incomplete) {
      return {
        connected: true,
        mode,
        availability: "incomplete",
        statusMessage:
          incompleteReason === "safety_guard" || incompleteReason === "repeated_cursor"
            ? "Stripe集計が上限に達したため未完了"
            : "Stripe集計が上限に達したため未完了",
        updateFailed: false,
        fetchedAt,
        grossRevenue: null,
        refunds: null,
        fees: null,
        netRevenue: null,
        currency,
        upcomingPayoutAmount:
          upcomingPayoutAmount === null ? null : roundMoney(upcomingPayoutAmount),
        upcomingPayoutAt,
        upcomingPayoutStatus,
      };
    }

    return {
      connected: true,
      mode,
      availability: "ok",
      statusMessage: null,
      updateFailed: false,
      fetchedAt,
      grossRevenue: roundMoney(grossRevenue),
      refunds: roundMoney(refunds),
      fees: roundMoney(fees),
      netRevenue: roundMoney(netRevenue),
      currency,
      upcomingPayoutAmount:
        upcomingPayoutAmount === null ? null : roundMoney(upcomingPayoutAmount),
      upcomingPayoutAt,
      upcomingPayoutStatus,
    };
  } catch {
    return empty({
      connected: true,
      mode,
      availability: "failed",
      statusMessage: "取得失敗",
      updateFailed: true,
      fetchedAt,
    });
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getConfiguredStripeMode(): OwnerStripeMode | null {
  return resolveStripeMode(getStripeSecretKey());
}

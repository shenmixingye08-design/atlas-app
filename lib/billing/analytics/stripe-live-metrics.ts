import "server-only";

import { getStripeClient } from "../stripe/client";
import { getStripeSecretKey, isStripeConfigured } from "../stripe/config";

import type { OwnerStripeMode } from "@/lib/owner/types";

export type StripeLiveMonthMetrics = {
  connected: boolean;
  mode: OwnerStripeMode | null;
  availability: "ok" | "disconnected" | "failed";
  statusMessage: string | null;
  updateFailed: boolean;
  fetchedAt: string | null;
  /** Gross paid invoice amount this calendar month (minor units → major). */
  grossRevenue: number;
  refunds: number;
  fees: number;
  netRevenue: number;
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

function dayWindowUnix(now: Date): { gte: number; lt: number } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return {
    gte: Math.floor(start.getTime() / 1000),
    lt: Math.floor(end.getTime() / 1000),
  };
}

export type StripeCashWindow = {
  gte: number;
  /** Exclusive upper bound. Omit for open-ended (all-time). */
  lt?: number;
};

export type StripeCashMetrics = {
  connected: boolean;
  mode: OwnerStripeMode | null;
  availability: "ok" | "disconnected" | "failed";
  statusMessage: string | null;
  updateFailed: boolean;
  fetchedAt: string | null;
  grossRevenue: number;
  refunds: number;
  fees: number;
  netRevenue: number;
  currency: string;
};

function fromMinor(amount: number, currency: string): number {
  // Zero-decimal currencies are rare for ATLAS (JPY is zero-decimal).
  if (currency.toLowerCase() === "jpy") return amount;
  return amount / 100;
}

async function fetchStripeCashForWindow(
  window: StripeCashWindow,
  now: Date = new Date(),
): Promise<StripeCashMetrics> {
  const secret = getStripeSecretKey();
  const mode = resolveStripeMode(secret);
  const empty = (partial: Partial<StripeCashMetrics>): StripeCashMetrics => ({
    connected: false,
    mode,
    availability: "disconnected",
    statusMessage: "Stripe未接続",
    updateFailed: false,
    fetchedAt: null,
    grossRevenue: 0,
    refunds: 0,
    fees: 0,
    netRevenue: 0,
    currency: "jpy",
    ...partial,
  });

  if (!isStripeConfigured()) {
    return empty({
      statusMessage: "本番キーとWebhook設定が必要です",
    });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return empty({
      statusMessage: "Stripe未接続",
    });
  }

  const fetchedAt = now.toISOString();
  const createdFilter =
    window.lt === undefined
      ? { gte: window.gte }
      : { gte: window.gte, lt: window.lt };

  try {
    let grossRevenue = 0;
    let currency = "jpy";
    let startingAfter: string | undefined;

    for (let page = 0; page < 20; page += 1) {
      const invoices = await stripe.invoices.list({
        status: "paid",
        created: createdFilter,
        limit: 100,
        starting_after: startingAfter,
      });

      for (const invoice of invoices.data) {
        currency = invoice.currency || currency;
        grossRevenue += fromMinor(invoice.amount_paid ?? 0, invoice.currency);
      }

      if (!invoices.has_more || invoices.data.length === 0) break;
      startingAfter = invoices.data[invoices.data.length - 1]?.id;
    }

    let refunds = 0;
    startingAfter = undefined;
    for (let page = 0; page < 20; page += 1) {
      const list = await stripe.refunds.list({
        created: createdFilter,
        limit: 100,
        starting_after: startingAfter,
      });
      for (const refund of list.data) {
        if (refund.status === "failed" || refund.status === "canceled") continue;
        currency = refund.currency || currency;
        refunds += fromMinor(refund.amount ?? 0, refund.currency);
      }
      if (!list.has_more || list.data.length === 0) break;
      startingAfter = list.data[list.data.length - 1]?.id;
    }

    let fees = 0;
    startingAfter = undefined;
    for (let page = 0; page < 20; page += 1) {
      const list = await stripe.balanceTransactions.list({
        created: createdFilter,
        limit: 100,
        starting_after: startingAfter,
      });
      for (const tx of list.data) {
        currency = tx.currency || currency;
        fees += fromMinor(Math.abs(tx.fee ?? 0), tx.currency);
      }
      if (!list.has_more || list.data.length === 0) break;
      startingAfter = list.data[list.data.length - 1]?.id;
    }

    const netRevenue = Math.max(0, grossRevenue - refunds - fees);

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

/** Today (local calendar day) Stripe cash metrics. */
export async function fetchStripeLiveTodayMetrics(
  now: Date = new Date(),
): Promise<StripeCashMetrics> {
  return fetchStripeCashForWindow(dayWindowUnix(now), now);
}

/** All-time Stripe cash metrics (from Stripe account start). */
export async function fetchStripeLiveCumulativeMetrics(
  now: Date = new Date(),
): Promise<StripeCashMetrics> {
  return fetchStripeCashForWindow({ gte: 0 }, now);
}

/**
 * Pull month-to-date Stripe cash metrics from the configured secret key.
 * Never invents amounts — disconnected / failed leave numeric fields at 0 with availability set.
 */
export async function fetchStripeLiveMonthMetrics(
  now: Date = new Date(),
): Promise<StripeLiveMonthMetrics> {
  const secret = getStripeSecretKey();
  const mode = resolveStripeMode(secret);
  const empty = (partial: Partial<StripeLiveMonthMetrics>): StripeLiveMonthMetrics => ({
    connected: false,
    mode,
    availability: "disconnected",
    statusMessage: "Stripe未接続",
    updateFailed: false,
    fetchedAt: null,
    grossRevenue: 0,
    refunds: 0,
    fees: 0,
    netRevenue: 0,
    currency: "jpy",
    upcomingPayoutAmount: null,
    upcomingPayoutAt: null,
    upcomingPayoutStatus: null,
    ...partial,
  });

  if (!isStripeConfigured()) {
    return empty({
      statusMessage: "本番キーとWebhook設定が必要です",
    });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return empty({
      statusMessage: "Stripe未接続",
    });
  }

  const cash = await fetchStripeCashForWindow(monthWindowUnix(now), now);
  if (cash.availability !== "ok") {
    return empty({
      connected: cash.connected,
      mode: cash.mode,
      availability: cash.availability,
      statusMessage: cash.statusMessage,
      updateFailed: cash.updateFailed,
      fetchedAt: cash.fetchedAt,
      currency: cash.currency,
    });
  }

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

  return {
    connected: true,
    mode,
    availability: "ok",
    statusMessage: null,
    updateFailed: false,
    fetchedAt: cash.fetchedAt,
    grossRevenue: cash.grossRevenue,
    refunds: cash.refunds,
    fees: cash.fees,
    netRevenue: cash.netRevenue,
    currency: cash.currency,
    upcomingPayoutAmount:
      upcomingPayoutAmount === null ? null : roundMoney(upcomingPayoutAmount),
    upcomingPayoutAt,
    upcomingPayoutStatus,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getConfiguredStripeMode(): OwnerStripeMode | null {
  return resolveStripeMode(getStripeSecretKey());
}

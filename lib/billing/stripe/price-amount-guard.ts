import "server-only";

import type { PlanId } from "../plans/types";
import { getExpectedStripeAmountJpy, getPaidPlans } from "../plans/registry";
import { getStripeClient } from "./client";
import { getStripePriceIdForPlan } from "./config";

export type StripePriceAmountCheck = {
  planId: PlanId;
  envPriceId: string | null;
  expectedAmountJpy: number;
  liveAmountJpy: number | null;
  currency: string | null;
  interval: string | null;
  matched: boolean;
  skipped: boolean;
  reason: string;
};

export type StripePriceAmountReport = {
  ok: boolean;
  liveVerified: boolean;
  checks: StripePriceAmountCheck[];
};

function unitAmountToJpy(unitAmount: number | null, currency: string): number | null {
  if (unitAmount == null) return null;
  if (currency.toLowerCase() !== "jpy") return null;
  return unitAmount;
}

/**
 * Read-only check: env Price IDs vs Plan Registry amounts vs live Stripe
 * (when a secret key is configured). Never creates or updates Prices.
 * Never creates Checkout Sessions or charges.
 */
export async function verifyStripePriceAmountsAgainstRegistry(): Promise<StripePriceAmountReport> {
  const stripe = getStripeClient();
  const checks: StripePriceAmountCheck[] = [];

  for (const plan of getPaidPlans()) {
    const planId = plan.planId;
    const expectedAmountJpy = getExpectedStripeAmountJpy(planId);
    const envPriceId = getStripePriceIdForPlan(planId);

    if (!envPriceId) {
      checks.push({
        planId,
        envPriceId: null,
        expectedAmountJpy,
        liveAmountJpy: null,
        currency: null,
        interval: null,
        matched: false,
        skipped: true,
        reason: "STRIPE_PRICE_* is not configured in this environment",
      });
      continue;
    }

    if (!stripe) {
      checks.push({
        planId,
        envPriceId,
        expectedAmountJpy,
        liveAmountJpy: null,
        currency: null,
        interval: null,
        matched: false,
        skipped: true,
        reason: "Stripe secret is not configured — Price ID present, live amount not verified",
      });
      continue;
    }

    try {
      const price = await stripe.prices.retrieve(envPriceId);
      const currency = price.currency ?? null;
      const liveAmountJpy = unitAmountToJpy(price.unit_amount, price.currency ?? "");
      const interval = price.recurring?.interval ?? null;
      const matched =
        liveAmountJpy === expectedAmountJpy &&
        (interval === "month" || interval === null);

      checks.push({
        planId,
        envPriceId,
        expectedAmountJpy,
        liveAmountJpy,
        currency,
        interval,
        matched,
        skipped: false,
        reason: matched
          ? "live Stripe amount matches Plan Registry"
          : `mismatch env=${envPriceId} live=${liveAmountJpy} ${currency} /${interval} expected=${expectedAmountJpy} JPY/month`,
      });
    } catch (error) {
      checks.push({
        planId,
        envPriceId,
        expectedAmountJpy,
        liveAmountJpy: null,
        currency: null,
        interval: null,
        matched: false,
        skipped: false,
        reason:
          error instanceof Error
            ? `Stripe retrieve failed: ${error.message}`
            : "Stripe retrieve failed",
      });
    }
  }

  const liveChecks = checks.filter((row) => !row.skipped);
  const liveVerified = liveChecks.length > 0;
  const ok = liveVerified ? liveChecks.every((row) => row.matched) : true;

  return { ok, liveVerified, checks };
}

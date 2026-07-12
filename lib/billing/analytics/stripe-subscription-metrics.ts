import "server-only";

import { getPlanDefinition } from "../plans/registry";
import type { PlanId } from "../plans/types";
import { getStripeClient } from "../stripe/client";
import {
  getStripePriceIdForPlan,
  isStripeConfigured,
  resolvePlanIdFromStripePrice,
} from "../stripe/config";

import type { OwnerBillingMetrics } from "./types";

export type StripeSubscriptionLiveMetrics = {
  connected: boolean;
  availability: "ok" | "disconnected" | "failed";
  statusMessage: string | null;
  fetchedAt: string | null;
  metrics: OwnerBillingMetrics | null;
  cancelScheduledCount: number;
  paymentFailureCount: number;
};

/**
 * Live paid-subscription counts from Stripe (survives serverless cold starts).
 * Does not invent demo numbers when disconnected.
 */
export async function fetchStripeSubscriptionLiveMetrics(): Promise<StripeSubscriptionLiveMetrics> {
  const baseDisconnected = (): StripeSubscriptionLiveMetrics => ({
    connected: false,
    availability: "disconnected",
    statusMessage: "Stripe未接続",
    fetchedAt: null,
    metrics: null,
    cancelScheduledCount: 0,
    paymentFailureCount: 0,
  });

  if (!isStripeConfigured()) {
    return {
      ...baseDisconnected(),
      statusMessage: "本番キーとWebhook設定が必要です",
    };
  }

  const stripe = getStripeClient();
  if (!stripe) return baseDisconnected();

  const fetchedAt = new Date().toISOString();

  try {
    const counts: Record<Exclude<PlanId, "free">, number> = {
      light: 0,
      standard: 0,
      premium: 0,
    };
    let cancelScheduledCount = 0;
    let freeSubscribers = 0;
    let churnedSubscribers = 0;
    let startingAfter: string | undefined;

    for (let page = 0; page < 20; page += 1) {
      const list = await stripe.subscriptions.list({
        status: "all",
        limit: 100,
        starting_after: startingAfter,
        expand: ["data.items.data.price"],
      });

      for (const sub of list.data) {
        const priceId =
          sub.items.data[0]?.price && typeof sub.items.data[0].price === "object"
            ? sub.items.data[0].price.id
            : typeof sub.items.data[0]?.price === "string"
              ? sub.items.data[0].price
              : null;
        const planId =
          resolvePlanIdFromStripePrice(priceId) ??
          (["light", "standard", "premium"] as const).find(
            (id) => getStripePriceIdForPlan(id) === priceId,
          ) ??
          null;

        if (sub.status === "canceled") {
          churnedSubscribers += 1;
          continue;
        }

        if (sub.status === "incomplete" || sub.status === "incomplete_expired") {
          continue;
        }

        if (!planId) {
          // Unmapped price — count as free/unknown only when active-like
          if (sub.status === "active" || sub.status === "trialing") {
            freeSubscribers += 1;
          }
          continue;
        }

        if (
          (sub.status === "active" || sub.status === "trialing") &&
          planId &&
          planId !== "free"
        ) {
          counts[planId] += 1;
          if (sub.cancel_at_period_end) {
            cancelScheduledCount += 1;
          }
        }
      }

      if (!list.has_more || list.data.length === 0) break;
      startingAfter = list.data[list.data.length - 1]?.id;
    }

    const planBreakdown = (["light", "standard", "premium"] as const).map(
      (planId) => {
        const plan = getPlanDefinition(planId);
        const activeSubscribers = counts[planId];
        return {
          planId,
          planName: plan.name,
          monthlyPriceJpy: plan.monthlyPriceJpy,
          activeSubscribers,
          mrrJpy: plan.monthlyPriceJpy * activeSubscribers,
        };
      },
    );

    const mrrJpy = planBreakdown.reduce((sum, row) => sum + row.mrrJpy, 0);
    const paidSubscribers = planBreakdown.reduce(
      (sum, row) => sum + row.activeSubscribers,
      0,
    );

    return {
      connected: true,
      availability: "ok",
      statusMessage: null,
      fetchedAt,
      cancelScheduledCount,
      paymentFailureCount: 0,
      metrics: {
        monthlyRevenueJpy: mrrJpy,
        mrrJpy,
        paidSubscribers,
        freeSubscribers,
        churnedSubscribers,
        planBreakdown,
        stripeConnected: true,
      },
    };
  } catch {
    return {
      connected: true,
      availability: "failed",
      statusMessage: "取得失敗",
      fetchedAt,
      metrics: null,
      cancelScheduledCount: 0,
      paymentFailureCount: 0,
    };
  }
}

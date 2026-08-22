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
import { paginateStripeList } from "./stripe-paginate";

export type StripeSubscriptionLiveMetrics = {
  connected: boolean;
  availability: "ok" | "disconnected" | "failed" | "incomplete";
  statusMessage: string | null;
  fetchedAt: string | null;
  metrics: OwnerBillingMetrics | null;
  cancelScheduledCount: number | null;
  paymentFailureCount: number | null;
};

type StripeSubscriptionClient = {
  subscriptions: {
    list: (params: Record<string, unknown>) => Promise<{
      data: Array<{
        id: string;
        status: string;
        cancel_at_period_end?: boolean;
        items: {
          data: Array<{
            price?: { id?: string } | string;
          }>;
        };
      }>;
      has_more: boolean;
    }>;
  };
};

/**
 * Live paid-subscription counts from Stripe (survives serverless cold starts).
 * Does not invent demo numbers when disconnected.
 * Free users are NOT inferred from unmapped Stripe subscriptions.
 */
export async function fetchStripeSubscriptionLiveMetrics(
  clientOverride?: StripeSubscriptionClient | null,
): Promise<StripeSubscriptionLiveMetrics> {
  const baseDisconnected = (): StripeSubscriptionLiveMetrics => ({
    connected: false,
    availability: "disconnected",
    statusMessage: "Stripe未接続",
    fetchedAt: null,
    metrics: null,
    cancelScheduledCount: null,
    paymentFailureCount: null,
  });

  if (!clientOverride && !isStripeConfigured()) {
    return {
      ...baseDisconnected(),
      statusMessage: "本番キーとWebhook設定が必要です",
    };
  }

  const stripe =
    clientOverride ?? (getStripeClient() as StripeSubscriptionClient | null);
  if (!stripe) return baseDisconnected();

  const fetchedAt = new Date().toISOString();

  try {
    const counts: Record<Exclude<PlanId, "free">, number> = {
      light: 0,
      standard: 0,
      premium: 0,
    };
    let cancelScheduledCount = 0;
    let unmappedActive = 0;
    let churnedSubscribers = 0;

    const pages = await paginateStripeList((startingAfter) =>
      stripe.subscriptions.list({
        status: "all",
        limit: 100,
        starting_after: startingAfter,
        expand: ["data.items.data.price"],
      }),
    );

    for (const sub of pages.items) {
      const priceId =
        sub.items.data[0]?.price && typeof sub.items.data[0].price === "object"
          ? sub.items.data[0].price.id ?? null
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
        if (sub.status === "active" || sub.status === "trialing") {
          unmappedActive += 1;
        }
        continue;
      }

      if (
        (sub.status === "active" || sub.status === "trialing") &&
        planId !== "free"
      ) {
        counts[planId] += 1;
        if (sub.cancel_at_period_end) {
          cancelScheduledCount += 1;
        }
      }
    }

    if (!pages.complete) {
      return {
        connected: true,
        availability: "incomplete",
        statusMessage: "Stripe集計が上限に達したため未完了",
        fetchedAt,
        metrics: null,
        cancelScheduledCount: null,
        paymentFailureCount: null,
      };
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
      statusMessage:
        unmappedActive > 0
          ? `allowlist外のactive/trialingが${unmappedActive}件あります（Paidには含めていません）`
          : null,
      fetchedAt,
      cancelScheduledCount,
      paymentFailureCount: null,
      metrics: {
        monthlyRevenueJpy: mrrJpy,
        mrrJpy,
        paidSubscribers,
        freeSubscribers: 0,
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
      cancelScheduledCount: null,
      paymentFailureCount: null,
    };
  }
}

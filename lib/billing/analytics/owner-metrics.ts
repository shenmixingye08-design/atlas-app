import { listBillingHistoryRecords } from "../history/store";
import { getPlanDefinition } from "../plans/registry";
import type { PlanId } from "../plans/types";
import { countSubscriptionsByPlan, listUserSubscriptions } from "../subscriptions/store";
import { isPaidCapableStatus } from "../subscriptions/service";

import {
  getStripePublishableKey,
  getStripeSecretKey,
} from "../stripe/config";
import { getConfiguredStripeMode } from "./stripe-live-metrics";
import type { OwnerBillingMetrics, OwnerPlanBreakdown } from "./types";

export type { OwnerBillingMetrics, OwnerPlanBreakdown } from "./types";

export type OwnerBillingMetricsExtended = OwnerBillingMetrics & {
  cancelScheduledCount: number;
  paymentFailureCount: number;
  hasSubscriptionRecords: boolean;
  stripeMode: "live" | "test" | null;
};

function monthPrefix(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Subscription-store metrics only — no demo fillers when the store is empty.
 * Cash revenue comes from Stripe live metrics, not MRR × FX.
 */
export function getOwnerBillingMetrics(
  now: Date = new Date(),
): OwnerBillingMetricsExtended {
  const planCounts = countSubscriptionsByPlan();
  const allRecords = listUserSubscriptions();
  const prefix = monthPrefix(now);

  const churnedSubscribers = allRecords.filter(
    (record) => record.status === "canceled",
  ).length;

  const cancelScheduledCount = allRecords.filter(
    (record) =>
      record.cancelAtPeriodEnd &&
      record.planId !== "free" &&
      isPaidCapableStatus(record.status),
  ).length;

  const paymentFailureCount = listBillingHistoryRecords().filter(
    (record) =>
      record.status === "payment_failed" &&
      record.createdAt.startsWith(prefix),
  ).length;

  const planBreakdown = (["light", "standard", "premium"] as const).map(
    (planId: Exclude<PlanId, "free">) => {
      const plan = getPlanDefinition(planId);
      const activeSubscribers = planCounts[planId];
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
    monthlyRevenueJpy: mrrJpy,
    mrrJpy,
    paidSubscribers,
    freeSubscribers: planCounts.free,
    churnedSubscribers,
    planBreakdown,
    stripeConnected: Boolean(
      getStripeSecretKey() && getStripePublishableKey(),
    ),
    cancelScheduledCount,
    paymentFailureCount,
    hasSubscriptionRecords: allRecords.length > 0,
    stripeMode: getConfiguredStripeMode(),
  };
}

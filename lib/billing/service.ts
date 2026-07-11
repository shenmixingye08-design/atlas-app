import "server-only";

import { getPlanDefinition, listPlanDefinitions } from "./plans/registry";
import type { PlanDefinition, PlanId } from "./plans/types";
import { listUserBillingNotifications } from "./notifications/service";
import { isAutomationSuspendedForUser } from "./subscriptions/lifecycle";
import { applySubscriptionFromStripe, getUserSubscriptionView } from "./subscriptions/service";
import { isStripeLiveMode } from "./stripe/checkout";
import { getUserUsageLimitSummary } from "./usage/service";
import type { UserBillingSummary } from "./types";
import { isAtlasProduction } from "@/lib/runtime/is-production";

export type { UserBillingSummary } from "./types";

export function getUserBillingSummary(userId: string): UserBillingSummary {
  const subscription = getUserSubscriptionView(userId);
  const usage = getUserUsageLimitSummary(userId);
  const plan = getPlanDefinition(subscription.planId);

  return {
    subscription,
    usage,
    plan,
    stripeLiveMode: isStripeLiveMode(),
    billingPortalAvailable: Boolean(subscription.stripeCustomerId),
    automationsSuspended: isAutomationSuspendedForUser(userId),
    notifications: listUserBillingNotifications(userId).slice(0, 5),
  };
}

export function listPublicPlans(): readonly PlanDefinition[] {
  return listPlanDefinitions();
}

export function completeMockCheckout(
  userId: string,
  planId: PlanId,
): UserBillingSummary {
  if (isAtlasProduction()) {
    throw new Error("Mock checkout is disabled in production");
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  applySubscriptionFromStripe({
    userId,
    stripeCustomerId: `mock_cus_${userId.slice(0, 8)}`,
    stripeSubscriptionId: `mock_sub_${Date.now()}`,
    planId,
    status: "active",
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: false,
  });

  return getUserBillingSummary(userId);
}

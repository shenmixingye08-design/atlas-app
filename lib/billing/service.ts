import "server-only";

import { getPlanDefinition, listPlanDefinitions } from "./plans/registry";
import type { PlanDefinition, PlanId } from "./plans/types";
import { listUserBillingNotifications } from "./notifications/service";
import { isAutomationSuspendedForUser } from "./subscriptions/lifecycle";
import { applySubscriptionFromStripe, getUserSubscriptionView } from "./subscriptions/service";
import { isStripeLiveMode } from "./stripe/checkout";
import { getStripeSecretDiagnostics } from "./stripe/config";
import { getUserUsageLimitSummary } from "./usage/service";
import type { UserBillingSummary } from "./types";
import { isAtlasProduction } from "@/lib/runtime/is-production";

export type { UserBillingSummary } from "./types";

export async function getUserBillingSummary(
  userId: string,
): Promise<UserBillingSummary> {
  const subscription = getUserSubscriptionView(userId);
  const usage = getUserUsageLimitSummary(userId);
  const plan = getPlanDefinition(subscription.planId);
  const secretDiagnostics = getStripeSecretDiagnostics();
  const notifications = await listUserBillingNotifications(userId);

  return {
    subscription,
    usage,
    plan,
    stripeLiveMode: isStripeLiveMode(),
    secretConfigured: secretDiagnostics.secretConfigured,
    secretLength: secretDiagnostics.secretLength,
    secretPrefixValid: secretDiagnostics.secretPrefixValid,
    billingPortalAvailable: Boolean(subscription.stripeCustomerId),
    automationsSuspended: isAutomationSuspendedForUser(userId),
    notifications: notifications.slice(0, 5),
  };
}

export function listPublicPlans(): readonly PlanDefinition[] {
  return listPlanDefinitions();
}

export async function completeMockCheckout(
  userId: string,
  planId: PlanId,
): Promise<UserBillingSummary> {
  if (isAtlasProduction()) {
    throw new Error("Mock checkout is disabled in production");
  }

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await applySubscriptionFromStripe({
    userId,
    stripeCustomerId: `mock_cus_${userId.slice(0, 8)}`,
    stripeSubscriptionId: `mock_sub_${Date.now()}`,
    planId,
    status: "active",
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: false,
  });

  return await getUserBillingSummary(userId);
}

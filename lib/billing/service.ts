import "server-only";

import { getPlanDefinition, listPlanDefinitions } from "./plans/registry";
import type { PlanDefinition, PlanId } from "./plans/types";
import { listUserBillingNotifications } from "./notifications/service";
import { isAutomationSuspendedForUser } from "./subscriptions/lifecycle";
import {
  applySubscriptionFromStripe,
  resolveEffectivePlanIdFromRecord,
  toUserSubscriptionView,
} from "./subscriptions/service";
import { resolveUserSubscriptionAuthority } from "./subscriptions/store";
import { isStripeLiveMode } from "./stripe/checkout";
import {
  getStripeRuntimeConfigStatus,
  getStripeSecretDiagnostics,
} from "./stripe/config";
import { getUserUsageLimitSummary } from "./usage/service";
import { buildUsageAwarenessView } from "./usage-awareness/view";
import type { UserBillingSummary } from "./types";
import { isAtlasProduction } from "@/lib/runtime/is-production";
import { safeLog } from "@/lib/security/redact";
import { createHash } from "crypto";

export type { UserBillingSummary } from "./types";

export async function getUserBillingSummary(
  userId: string,
): Promise<UserBillingSummary> {
  const authority = await resolveUserSubscriptionAuthority(userId);
  const record = authority.record;
  const subscription = toUserSubscriptionView(record);
  const effectivePlanId = resolveEffectivePlanIdFromRecord(record);
  const usage = getUserUsageLimitSummary(userId, effectivePlanId);
  const plan = getPlanDefinition(record.planId);
  const secretDiagnostics = getStripeSecretDiagnostics();
  const notifications = await listUserBillingNotifications(userId);
  const usageAwareness = buildUsageAwarenessView({
    usage,
    catalog: listPlanDefinitions(),
    subscribedPlanId: record.planId,
  });

  safeLog("info", "[billing/summary] snapshot", {
    userFingerprint: createHash("sha256").update(userId).digest("hex").slice(0, 12),
    planId: record.planId,
    effectivePlanId,
    status: record.status,
    hasCustomer: Boolean(record.stripeCustomerId),
    hasSubscription: Boolean(record.stripeSubscriptionId),
    hasPrice: Boolean(record.stripePriceId),
    source: authority.source,
    consistency: authority.consistency,
    usagePlanId: usage.planId,
  });

  return {
    subscription,
    usage,
    usageAwareness,
    plan,
    stripeLiveMode: isStripeLiveMode(),
    secretConfigured: secretDiagnostics.secretConfigured,
    secretLength: secretDiagnostics.secretLength,
    secretPrefixValid: secretDiagnostics.secretPrefixValid,
    billingPortalAvailable: Boolean(record.stripeCustomerId),
    automationsSuspended: isAutomationSuspendedForUser(userId),
    notifications: notifications.slice(0, 5),
    subscriptionSource: authority.source,
    subscriptionConsistency: authority.consistency,
    stripeConfig: getStripeRuntimeConfigStatus(),
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

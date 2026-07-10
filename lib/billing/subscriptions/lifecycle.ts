import "server-only";

import { getPlanDefinition } from "../plans/registry";
import type { PlanId } from "../plans/types";
import {
  applySubscriptionFromStripe,
  downgradeToFree,
  resolveUserSubscription,
  upsertUserSubscription,
} from "./service";
import type { SubscriptionStatus, UserSubscriptionRecord } from "./types";
import {
  notifyUserPaymentGraceScheduled,
  notifyUserPlanChanged,
  notifyUserPlanDowngraded,
} from "../notifications/service";
import { setAutomationTaskCount } from "../usage/store";

const PAYMENT_FAILURE_GRACE_DAYS = 7;

export function syncUserPlanProfile(userId: string, planId: PlanId): void {
  upsertUserSubscription(userId, {
    planId,
    planProfileSyncedAt: new Date().toISOString(),
  });
}

export function clearSubscriptionLifecycleFlags(userId: string): UserSubscriptionRecord {
  return upsertUserSubscription(userId, {
    automationsSuspended: false,
    paymentFailureGraceEndsAt: null,
    planProfileSyncedAt: new Date().toISOString(),
  });
}

export function suspendAutomationsForUser(userId: string): UserSubscriptionRecord {
  setAutomationTaskCount(userId, 0);
  return upsertUserSubscription(userId, {
    automationsSuspended: true,
  });
}

export function schedulePaymentFailureGrace(userId: string): UserSubscriptionRecord {
  const graceEndsAt = new Date();
  graceEndsAt.setDate(graceEndsAt.getDate() + PAYMENT_FAILURE_GRACE_DAYS);

  const record = upsertUserSubscription(userId, {
    status: "past_due",
    paymentFailureGraceEndsAt: graceEndsAt.toISOString(),
  });

  notifyUserPaymentGraceScheduled(userId, graceEndsAt.toISOString());
  return record;
}

export function applyPaidPlanFromWebhook(input: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}): UserSubscriptionRecord {
  const record = applySubscriptionFromStripe(input);
  clearSubscriptionLifecycleFlags(input.userId);
  syncUserPlanProfile(input.userId, input.planId);
  notifyUserPlanChanged(input.userId, getPlanDefinition(input.planId).name);
  return record;
}

export function applyDowngradeFromWebhook(userId: string): UserSubscriptionRecord {
  const record = downgradeToFree(userId, { source: "stripe_webhook" });
  suspendAutomationsForUser(userId);
  syncUserPlanProfile(userId, "free");
  notifyUserPlanDowngraded(userId);
  return record;
}

export function isAutomationSuspendedForUser(userId: string): boolean {
  const subscription = resolveUserSubscription(userId);
  if (subscription.automationsSuspended) return true;

  if (subscription.paymentFailureGraceEndsAt) {
    return new Date(subscription.paymentFailureGraceEndsAt).getTime() <= Date.now();
  }

  return false;
}

export function enforcePaymentFailureGraceIfExpired(userId: string): void {
  const subscription = resolveUserSubscription(userId);
  if (!subscription.paymentFailureGraceEndsAt) return;
  if (subscription.automationsSuspended) return;

  if (new Date(subscription.paymentFailureGraceEndsAt).getTime() <= Date.now()) {
    suspendAutomationsForUser(userId);
  }
}

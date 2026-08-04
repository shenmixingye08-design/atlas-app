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

export async function syncUserPlanProfile(
  userId: string,
  planId: PlanId,
): Promise<void> {
  await upsertUserSubscription(userId, {
    planId,
    planProfileSyncedAt: new Date().toISOString(),
  });
}

export async function clearSubscriptionLifecycleFlags(
  userId: string,
): Promise<UserSubscriptionRecord> {
  return upsertUserSubscription(userId, {
    automationsSuspended: false,
    paymentFailureGraceEndsAt: null,
    planProfileSyncedAt: new Date().toISOString(),
  });
}

export async function suspendAutomationsForUser(
  userId: string,
): Promise<UserSubscriptionRecord> {
  setAutomationTaskCount(userId, 0);
  return upsertUserSubscription(userId, {
    automationsSuspended: true,
  });
}

export async function schedulePaymentFailureGrace(
  userId: string,
): Promise<UserSubscriptionRecord> {
  const graceEndsAt = new Date();
  graceEndsAt.setDate(graceEndsAt.getDate() + PAYMENT_FAILURE_GRACE_DAYS);

  const record = await upsertUserSubscription(userId, {
    status: "past_due",
    paymentFailureGraceEndsAt: graceEndsAt.toISOString(),
  });

  await notifyUserPaymentGraceScheduled(userId, graceEndsAt.toISOString());
  return record;
}

export async function applyPaidPlanFromWebhook(input: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripePriceId?: string | null;
}): Promise<UserSubscriptionRecord> {
  const record = await applySubscriptionFromStripe(input);

  // Only clear payment-failure grace when Stripe reports a healthy subscription.
  // past_due / unpaid / incomplete must keep grace set by invoice.payment_failed.
  if (input.status === "active" || input.status === "trialing") {
    await clearSubscriptionLifecycleFlags(input.userId);
    await notifyUserPlanChanged(input.userId, getPlanDefinition(input.planId).name);
  }

  await syncUserPlanProfile(input.userId, input.planId);
  return record;
}

export async function applyDowngradeFromWebhook(
  userId: string,
): Promise<UserSubscriptionRecord> {
  const record = await downgradeToFree(userId, { source: "stripe_webhook" });
  await suspendAutomationsForUser(userId);
  await syncUserPlanProfile(userId, "free");
  await notifyUserPlanDowngraded(userId);
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

export async function enforcePaymentFailureGraceIfExpired(
  userId: string,
): Promise<void> {
  const subscription = resolveUserSubscription(userId);
  if (!subscription.paymentFailureGraceEndsAt) return;
  if (subscription.automationsSuspended) return;

  if (new Date(subscription.paymentFailureGraceEndsAt).getTime() <= Date.now()) {
    await suspendAutomationsForUser(userId);
  }
}

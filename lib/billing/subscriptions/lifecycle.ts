import "server-only";

import { getPlanDefinition } from "../plans/registry";
import type { PlanId } from "../plans/types";
import {
  applySubscriptionFromStripe,
  downgradeToFree,
  resolveUserSubscription,
  upsertUserSubscription,
} from "./service";
import { findSubscriptionByStripeCustomerId } from "./store";
import type { SubscriptionStatus, UserSubscriptionRecord } from "./types";
import {
  notifyUserPaymentGraceScheduled,
  notifyUserPlanChanged,
  notifyUserPlanDowngraded,
} from "../notifications/service";
import { setAutomationTaskCount } from "../usage/store";

const PAYMENT_FAILURE_GRACE_DAYS = 7;

/**
 * Fail closed when a Stripe customer is already mapped to a different Clerk user.
 * Prevents cross-user entitlement grant via metadata spoof / Dashboard mistakes.
 */
export class StripeCustomerOwnershipError extends Error {
  readonly code = "stripe_customer_owned_by_other_user" as const;

  constructor(
    message = "Stripe customer already linked to another user",
  ) {
    super(message);
    this.name = "StripeCustomerOwnershipError";
  }
}

export async function assertStripeCustomerNotOwnedByOtherUser(input: {
  userId: string;
  stripeCustomerId: string;
}): Promise<void> {
  const customerId = input.stripeCustomerId?.trim();
  if (!customerId) return;

  const existing = await findSubscriptionByStripeCustomerId(customerId);
  if (existing && existing.userId !== input.userId) {
    throw new StripeCustomerOwnershipError();
  }
}

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
  stripeEventCreated?: number;
}): Promise<UserSubscriptionRecord> {
  await assertStripeCustomerNotOwnedByOtherUser({
    userId: input.userId,
    stripeCustomerId: input.stripeCustomerId,
  });

  const record = await applySubscriptionFromStripe(input);

  // Only clear payment-failure grace when Stripe reports a healthy subscription.
  // past_due / unpaid / incomplete must keep grace set by invoice.payment_failed.
  if (input.status === "active" || input.status === "trialing") {
    await clearSubscriptionLifecycleFlags(input.userId);
    await notifyUserPlanChanged(input.userId, getPlanDefinition(input.planId).name);
  }

  await syncUserPlanProfile(input.userId, input.planId);
  if (input.stripeEventCreated) {
    return upsertUserSubscription(input.userId, {
      planProfileSyncedAt: new Date(input.stripeEventCreated * 1000).toISOString(),
    });
  }
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

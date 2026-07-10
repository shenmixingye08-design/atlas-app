import "server-only";

import { getPlanDefinition } from "../plans/registry";
import type { PlanId } from "../plans/types";

import {
  createDefaultSubscription,
  getUserSubscription,
  saveUserSubscription,
} from "./store";
import type { SubscriptionStatus, UserSubscriptionRecord, UserSubscriptionView } from "./types";
import { recordSubscriptionCancellation } from "@/lib/owner/cancellation-analysis/telemetry";
import type { CancellationReasonId } from "@/lib/owner/cancellation-analysis/types";

export function resolveUserSubscription(
  userId: string,
): UserSubscriptionRecord {
  return getUserSubscription(userId) ?? createDefaultSubscription(userId);
}

export function getUserSubscriptionView(userId: string): UserSubscriptionView {
  const record = resolveUserSubscription(userId);
  const plan = getPlanDefinition(record.planId);

  return {
    ...record,
    planName: plan.name,
    isPaid: plan.monthlyPriceJpy > 0 && record.status === "active",
  };
}

export function upsertUserSubscription(
  userId: string,
  patch: Partial<Omit<UserSubscriptionRecord, "userId">> & {
    planId?: PlanId;
    status?: SubscriptionStatus;
  },
): UserSubscriptionRecord {
  const current = resolveUserSubscription(userId);
  const next: UserSubscriptionRecord = {
    ...current,
    ...patch,
    userId,
    updatedAt: new Date().toISOString(),
  };

  return saveUserSubscription(next);
}

export function applySubscriptionFromStripe(input: {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}): UserSubscriptionRecord {
  return upsertUserSubscription(input.userId, {
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    planId: input.planId,
    status: input.status,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
  });
}

export function cancelSubscriptionAtPeriodEnd(
  userId: string,
): UserSubscriptionRecord {
  return upsertUserSubscription(userId, {
    cancelAtPeriodEnd: true,
    status: "active",
  });
}

export function downgradeToFree(
  userId: string,
  options?: {
    reasonId?: CancellationReasonId;
    source?: "stripe_webhook" | "billing_portal" | "manual";
  },
): UserSubscriptionRecord {
  const current = resolveUserSubscription(userId);

  if (current.planId !== "free" && current.status !== "canceled") {
    recordSubscriptionCancellation({
      userId,
      planId: current.planId,
      reasonId: options?.reasonId,
      source: options?.source ?? "stripe_webhook",
    });
  }

  return upsertUserSubscription(userId, {
    planId: "free",
    status: "canceled",
    stripeSubscriptionId: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date().toISOString(),
  });
}

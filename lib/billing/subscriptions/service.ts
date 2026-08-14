import "server-only";

import { getPlanDefinition } from "../plans/registry";
import type { PlanId } from "../plans/types";

import {
  createDefaultSubscription,
  getUserSubscription,
  resolveUserSubscriptionDurable,
  saveUserSubscription,
} from "./store";
import type { SubscriptionStatus, UserSubscriptionRecord, UserSubscriptionView } from "./types";
import { recordSubscriptionCancellation } from "@/lib/owner/cancellation-analysis/telemetry";
import type { CancellationReasonId } from "@/lib/owner/cancellation-analysis/types";

function normalizeSubscriptionRecord(
  record: UserSubscriptionRecord,
): UserSubscriptionRecord {
  return {
    ...record,
    stripePriceId: record.stripePriceId ?? null,
  };
}

/**
 * Memory-only resolve. May invent an ephemeral Free view when the process
 * cache is cold — never use this as the base for durable writes (P0-1).
 */
export function resolveUserSubscription(
  userId: string,
): UserSubscriptionRecord {
  const existing = getUserSubscription(userId);
  if (existing) return normalizeSubscriptionRecord(existing);
  return createDefaultSubscription(userId);
}

/**
 * Write-safe resolve: memory → Supabase → Clerk → default Free.
 * Callers that persist must use this so cold-start cannot invent Free over a
 * durable paid subscription (P0-1).
 */
export async function resolveUserSubscriptionForWrite(
  userId: string,
): Promise<UserSubscriptionRecord> {
  return normalizeSubscriptionRecord(
    await resolveUserSubscriptionDurable(userId),
  );
}

export function isPaidCapableStatus(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing";
}

export function toUserSubscriptionView(
  record: UserSubscriptionRecord,
): UserSubscriptionView {
  const plan = getPlanDefinition(record.planId);
  return {
    ...normalizeSubscriptionRecord(record),
    planName: plan.name,
    isPaid: plan.monthlyPriceJpy > 0 && isPaidCapableStatus(record.status),
  };
}

export function resolveEffectivePlanIdFromRecord(
  record: UserSubscriptionRecord,
): PlanId {
  if (record.planId === "free") return "free";
  if (isPaidCapableStatus(record.status)) return record.planId;
  return "free";
}

export function getUserSubscriptionView(userId: string): UserSubscriptionView {
  return toUserSubscriptionView(resolveUserSubscription(userId));
}

export async function upsertUserSubscription(
  userId: string,
  patch: Partial<Omit<UserSubscriptionRecord, "userId">> & {
    planId?: PlanId;
    status?: SubscriptionStatus;
  },
): Promise<UserSubscriptionRecord> {
  const current = await resolveUserSubscriptionForWrite(userId);
  const next: UserSubscriptionRecord = {
    ...current,
    ...patch,
    userId,
    updatedAt: new Date().toISOString(),
  };

  return saveUserSubscription(next);
}

export async function applySubscriptionFromStripe(input: {
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
  return upsertUserSubscription(input.userId, {
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripePriceId: input.stripePriceId ?? null,
    planId: input.planId,
    status: input.status,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd,
  });
}

export async function cancelSubscriptionAtPeriodEnd(
  userId: string,
): Promise<UserSubscriptionRecord> {
  return upsertUserSubscription(userId, {
    cancelAtPeriodEnd: true,
    status: "active",
  });
}

export async function downgradeToFree(
  userId: string,
  options?: {
    reasonId?: CancellationReasonId;
    source?: "stripe_webhook" | "billing_portal" | "manual";
  },
): Promise<UserSubscriptionRecord> {
  const current = await resolveUserSubscriptionForWrite(userId);

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

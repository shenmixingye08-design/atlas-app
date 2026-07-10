import type { PlanId } from "../plans/types";
import type { UserSubscriptionRecord } from "./types";

type SubscriptionBucket = Map<string, UserSubscriptionRecord>;

function getBucket(): SubscriptionBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingSubscriptionStore?: SubscriptionBucket;
  };

  if (!globalScope.__atlasBillingSubscriptionStore) {
    globalScope.__atlasBillingSubscriptionStore = new Map();
  }

  return globalScope.__atlasBillingSubscriptionStore;
}

export function getUserSubscription(
  userId: string,
): UserSubscriptionRecord | null {
  return getBucket().get(userId) ?? null;
}

export function saveUserSubscription(
  record: UserSubscriptionRecord,
): UserSubscriptionRecord {
  getBucket().set(record.userId, record);
  return record;
}

export function listUserSubscriptions(): UserSubscriptionRecord[] {
  return [...getBucket().values()];
}

export function createDefaultSubscription(userId: string): UserSubscriptionRecord {
  const now = new Date().toISOString();
  return {
    userId,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    planId: "free",
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    updatedAt: now,
  };
}

export function resetSubscriptionStore(): void {
  getBucket().clear();
}

export function countSubscriptionsByPlan(): Record<PlanId, number> {
  const counts: Record<PlanId, number> = {
    free: 0,
    light: 0,
    standard: 0,
    premium: 0,
  };

  for (const record of getBucket().values()) {
    if (record.status === "active" || record.status === "trialing") {
      counts[record.planId] += 1;
    }
  }

  return counts;
}

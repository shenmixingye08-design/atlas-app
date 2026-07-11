import type { PlanId } from "../plans/types";
import type { UserSubscriptionRecord } from "./types";
import {
  loadSubscriptionFromClerk,
  persistSubscriptionToClerk,
  readSubscriptionsFromDisk,
  writeSubscriptionsToDisk,
} from "./persistence";

type SubscriptionBucket = Map<string, UserSubscriptionRecord>;

function getBucket(): SubscriptionBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingSubscriptionStore?: SubscriptionBucket;
    __atlasBillingSubscriptionStoreHydrated?: boolean;
  };

  if (!globalScope.__atlasBillingSubscriptionStore) {
    globalScope.__atlasBillingSubscriptionStore = new Map();
  }

  if (!globalScope.__atlasBillingSubscriptionStoreHydrated) {
    const fromDisk = readSubscriptionsFromDisk();
    for (const [userId, record] of fromDisk.entries()) {
      globalScope.__atlasBillingSubscriptionStore.set(userId, record);
    }
    globalScope.__atlasBillingSubscriptionStoreHydrated = true;
  }

  return globalScope.__atlasBillingSubscriptionStore;
}

function persistBucket(bucket: SubscriptionBucket): void {
  writeSubscriptionsToDisk(bucket);
}

export function getUserSubscription(
  userId: string,
): UserSubscriptionRecord | null {
  return getBucket().get(userId) ?? null;
}

export function saveUserSubscription(
  record: UserSubscriptionRecord,
): UserSubscriptionRecord {
  const bucket = getBucket();
  bucket.set(record.userId, record);
  persistBucket(bucket);
  void persistSubscriptionToClerk(record);
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
    stripePriceId: null,
    planId: "free",
    status: "active",
    currentPeriodStart: now,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    updatedAt: now,
  };
}

export function resetSubscriptionStore(): void {
  const bucket = getBucket();
  bucket.clear();
  persistBucket(bucket);
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

/** Hydrate memory from Clerk when disk/memory miss (serverless cold start). */
export async function resolveUserSubscriptionDurable(
  userId: string,
): Promise<UserSubscriptionRecord> {
  const cached = getUserSubscription(userId);
  if (cached) return cached;

  const fromClerk = await loadSubscriptionFromClerk(userId);
  if (fromClerk) {
    const bucket = getBucket();
    bucket.set(userId, fromClerk);
    persistBucket(bucket);
    return fromClerk;
  }

  return createDefaultSubscription(userId);
}

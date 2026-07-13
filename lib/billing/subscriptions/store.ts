import type { PlanId } from "../plans/types";
import type { UserSubscriptionRecord } from "./types";
import { warnIfProductionSupabaseServiceRoleMissing } from "@/lib/persistence/production-guard";

import {
  findSubscriptionByStripeCustomerIdFromSupabase,
  isBillingSupabaseConfigured,
  listSubscriptionsFromSupabase,
  loadSubscriptionFromClerk,
  loadSubscriptionFromSupabase,
  persistSubscriptionToClerk,
  persistSubscriptionToSupabase,
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
    // Disk hydrate is local/dev only (persistence skips disk in production).
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
  // Prefer Supabase as durable SoT when configured; Clerk remains secondary.
  if (!isBillingSupabaseConfigured()) {
    warnIfProductionSupabaseServiceRoleMissing("atlas_billing_subscriptions");
  } else {
    void persistSubscriptionToSupabase(record).then((ok) => {
      if (!ok) {
        console.warn(
          "[billing] Supabase subscription persist returned false for",
          record.userId,
        );
      }
    });
  }
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

/**
 * Hydrate memory from durable stores (serverless-safe).
 * Order: memory → Supabase → Clerk → default.
 * Disk is only used as an already-hydrated local/dev cache via getBucket().
 */
export async function resolveUserSubscriptionDurable(
  userId: string,
): Promise<UserSubscriptionRecord> {
  const cached = getUserSubscription(userId);
  if (cached) return cached;

  const fromSupabase = await loadSubscriptionFromSupabase(userId);
  if (fromSupabase) {
    const bucket = getBucket();
    bucket.set(userId, fromSupabase);
    persistBucket(bucket);
    return fromSupabase;
  }

  const fromClerk = await loadSubscriptionFromClerk(userId);
  if (fromClerk) {
    const bucket = getBucket();
    bucket.set(userId, fromClerk);
    persistBucket(bucket);
    // Backfill Supabase when available.
    void persistSubscriptionToSupabase(fromClerk);
    return fromClerk;
  }

  return createDefaultSubscription(userId);
}

export async function findSubscriptionByStripeCustomerId(
  stripeCustomerId: string,
): Promise<UserSubscriptionRecord | null> {
  const local = listUserSubscriptions().find(
    (record) => record.stripeCustomerId === stripeCustomerId,
  );
  if (local) return local;

  const fromSupabase =
    await findSubscriptionByStripeCustomerIdFromSupabase(stripeCustomerId);
  if (fromSupabase) {
    const bucket = getBucket();
    bucket.set(fromSupabase.userId, fromSupabase);
    persistBucket(bucket);
    return fromSupabase;
  }

  return null;
}

/** Best-effort merge of Supabase rows into the in-memory bucket (owner metrics). */
export async function hydrateSubscriptionsFromSupabase(): Promise<void> {
  const rows = await listSubscriptionsFromSupabase();
  if (rows.length === 0) return;

  const bucket = getBucket();
  for (const record of rows) {
    const existing = bucket.get(record.userId);
    if (
      !existing ||
      new Date(record.updatedAt).getTime() >=
        new Date(existing.updatedAt).getTime()
    ) {
      bucket.set(record.userId, record);
    }
  }
  persistBucket(bucket);
}

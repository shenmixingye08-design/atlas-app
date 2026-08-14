import type { PlanId } from "../plans/types";
import type { UserSubscriptionRecord } from "./types";
import { warnIfProductionSupabaseServiceRoleMissing } from "@/lib/persistence/production-guard";

import {
  pickAuthoritativeSubscription,
  type SubscriptionConsistency,
  type SubscriptionResolveSource,
} from "./authority";
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

type AuthorityMeta = {
  source: SubscriptionResolveSource;
  consistency: SubscriptionConsistency;
};

function getAuthorityMetaBucket(): Map<string, AuthorityMeta> {
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingSubscriptionAuthority?: Map<string, AuthorityMeta>;
  };
  if (!globalScope.__atlasBillingSubscriptionAuthority) {
    globalScope.__atlasBillingSubscriptionAuthority = new Map();
  }
  return globalScope.__atlasBillingSubscriptionAuthority;
}

function rememberAuthorityMeta(userId: string, meta: AuthorityMeta): void {
  getAuthorityMetaBucket().set(userId, meta);
}

export function getLastSubscriptionAuthority(
  userId: string,
): AuthorityMeta | null {
  return getAuthorityMetaBucket().get(userId) ?? null;
}

function cacheSubscription(record: UserSubscriptionRecord): void {
  const bucket = getBucket();
  bucket.set(record.userId, record);
  persistBucket(bucket);
}

/** Process-memory write only — does not persist to Supabase/Clerk. */
export function putSubscriptionInMemoryCache(
  record: UserSubscriptionRecord,
): void {
  cacheSubscription(record);
}

export function getUserSubscription(
  userId: string,
): UserSubscriptionRecord | null {
  return getBucket().get(userId) ?? null;
}

/**
 * True when durable paid state must not be replaced by an invented Free /
 * free-shaped cold-start write. Explicit downgrade (plan=free + canceled)
 * is allowed (P0-1).
 */
export function wouldOverwriteDurablePaidWithFreeInvent(
  incoming: UserSubscriptionRecord,
  durable: UserSubscriptionRecord,
): boolean {
  const durableLooksPaid =
    durable.planId !== "free" || Boolean(durable.stripeSubscriptionId);
  if (!durableLooksPaid) return false;

  const explicitDowngrade =
    incoming.planId === "free" && incoming.status === "canceled";
  if (explicitDowngrade) return false;

  return incoming.planId === "free" && durable.planId !== "free";
}

async function restoreDurablePaidInMemory(
  durable: UserSubscriptionRecord,
): Promise<void> {
  const bucket = getBucket();
  bucket.set(durable.userId, durable);
  persistBucket(bucket);
}

/**
 * Refuse Free-invent writes that would clobber paid state in Supabase or Clerk.
 * Returns the durable paid record when refused; otherwise null.
 */
async function findBlockingDurablePaid(
  record: UserSubscriptionRecord,
): Promise<UserSubscriptionRecord | null> {
  const fromSupabase = await loadSubscriptionFromSupabase(record.userId);
  if (
    fromSupabase &&
    wouldOverwriteDurablePaidWithFreeInvent(record, fromSupabase)
  ) {
    return fromSupabase;
  }

  const fromClerk = await loadSubscriptionFromClerk(record.userId);
  if (
    fromClerk &&
    wouldOverwriteDurablePaidWithFreeInvent(record, fromClerk)
  ) {
    return fromClerk;
  }

  return null;
}

async function persistSubscriptionToSupabaseGuarded(
  record: UserSubscriptionRecord,
): Promise<boolean> {
  const blocked = await findBlockingDurablePaid(record);
  if (blocked) {
    console.error(
      "[billing] P0-1 refused Free invent overwrite of durable paid subscription",
      {
        userId: record.userId,
        durablePlanId: blocked.planId,
        incomingPlanId: record.planId,
        incomingStatus: record.status,
      },
    );
    await restoreDurablePaidInMemory(blocked);
    return false;
  }
  return persistSubscriptionToSupabase(record);
}

async function persistSubscriptionToClerkGuarded(
  record: UserSubscriptionRecord,
): Promise<void> {
  const blocked = await findBlockingDurablePaid(record);
  if (blocked) {
    console.error(
      "[billing] P0-1 refused Free invent overwrite of Clerk paid subscription",
      {
        userId: record.userId,
        durablePlanId: blocked.planId,
        incomingPlanId: record.planId,
        incomingStatus: record.status,
      },
    );
    await restoreDurablePaidInMemory(blocked);
    return;
  }
  await persistSubscriptionToClerk(record);
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
    void persistSubscriptionToSupabaseGuarded(record).then((ok) => {
      if (!ok) {
        console.warn(
          "[billing] Supabase subscription persist returned false for",
          record.userId,
        );
      }
    });
  }
  void persistSubscriptionToClerkGuarded(record);
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
  getAuthorityMetaBucket().clear();
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

export type SubscriptionAuthority = {
  record: UserSubscriptionRecord;
  source: SubscriptionResolveSource;
  consistency: SubscriptionConsistency;
};

/**
 * Durable-first resolve. Process memory is a cache compared by updatedAt.
 * Stale invented Free never beats a durable paid (or identified) row.
 * Always re-reads Supabase/Clerk so serverless instances cannot diverge.
 */
export async function resolveUserSubscriptionAuthority(
  userId: string,
): Promise<SubscriptionAuthority> {
  const memory = getUserSubscription(userId);

  // Dedicated table DDL is NOT attempted on the request hot path.
  const fromSupabase = await loadSubscriptionFromSupabase(userId);
  const fromClerk = fromSupabase
    ? null
    : await loadSubscriptionFromClerk(userId);
  const durable = fromSupabase ?? fromClerk;
  const durableSource = fromSupabase
    ? "supabase"
    : fromClerk
      ? "clerk"
      : undefined;

  const picked = pickAuthoritativeSubscription({
    memory,
    durable,
    durableSource,
  });

  if (picked.record) {
    cacheSubscription(picked.record);
    if (
      fromClerk &&
      picked.source === "clerk" &&
      isBillingSupabaseConfigured()
    ) {
      void persistSubscriptionToSupabase(picked.record);
    }
    const result: SubscriptionAuthority = {
      record: picked.record,
      source: picked.source ?? durableSource ?? "memory_cache",
      consistency: picked.consistency,
    };
    rememberAuthorityMeta(userId, result);
    return result;
  }

  const invented = createDefaultSubscription(userId);
  cacheSubscription(invented);
  const result: SubscriptionAuthority = {
    record: invented,
    source: "default_free",
    consistency: "ok",
  };
  rememberAuthorityMeta(userId, result);
  return result;
}

export async function resolveUserSubscriptionDurable(
  userId: string,
): Promise<UserSubscriptionRecord> {
  return (await resolveUserSubscriptionAuthority(userId)).record;
}

export async function findSubscriptionByStripeCustomerId(
  stripeCustomerId: string,
): Promise<UserSubscriptionRecord | null> {
  const local = listUserSubscriptions().find(
    (record) => record.stripeCustomerId === stripeCustomerId,
  );
  const fromSupabase =
    await findSubscriptionByStripeCustomerIdFromSupabase(stripeCustomerId);
  const picked = pickAuthoritativeSubscription({
    memory: local ?? null,
    durable: fromSupabase,
    durableSource: "supabase",
  });
  if (picked.record) {
    cacheSubscription(picked.record);
    return picked.record;
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

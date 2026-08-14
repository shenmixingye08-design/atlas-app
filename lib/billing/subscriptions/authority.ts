import type { UserSubscriptionRecord } from "./types";

/**
 * Subscription SoT (MINERVOT):
 * - Stripe = external contract fact (webhook / checkout reconcile only)
 * - Supabase subscription = durable primary read model
 * - Clerk / atlas_user_state = secondary recovery
 * - process memory = cache only — never authoritative
 */

export type SubscriptionResolveSource =
  | "memory_cache"
  | "supabase"
  | "clerk"
  | "default_free";

export type SubscriptionConsistency = "ok" | "conflict";

export function isEphemeralFreeInvent(
  record: UserSubscriptionRecord | null | undefined,
): boolean {
  if (!record) return false;
  return (
    record.planId === "free" &&
    record.status === "active" &&
    !record.stripeCustomerId &&
    !record.stripeSubscriptionId &&
    !record.stripePriceId &&
    !record.cancelAtPeriodEnd
  );
}

export function subscriptionUpdatedAtMs(record: UserSubscriptionRecord): number {
  const ms = Date.parse(record.updatedAt);
  return Number.isFinite(ms) ? ms : 0;
}

function sameContract(
  left: UserSubscriptionRecord,
  right: UserSubscriptionRecord,
): boolean {
  return (
    left.planId === right.planId &&
    left.status === right.status &&
    (left.stripeSubscriptionId ?? null) === (right.stripeSubscriptionId ?? null) &&
    left.cancelAtPeriodEnd === right.cancelAtPeriodEnd
  );
}

const CONFLICT_WINDOW_MS = 2_000;

/**
 * Durable projection wins over stale process memory.
 * Memory may win only when it is a strictly newer write (same instance,
 * persist still in flight) and is not an invented Free row.
 */
export function pickAuthoritativeSubscription(input: {
  memory: UserSubscriptionRecord | null;
  durable: UserSubscriptionRecord | null;
  durableSource?: "supabase" | "clerk";
}): {
  record: UserSubscriptionRecord | null;
  source: SubscriptionResolveSource | null;
  consistency: SubscriptionConsistency;
} {
  const durableSource = input.durableSource ?? "supabase";
  const memory = input.memory;
  const durable = input.durable;

  if (!memory && !durable) {
    return { record: null, source: null, consistency: "ok" };
  }

  if (!memory && durable) {
    return { record: durable, source: durableSource, consistency: "ok" };
  }

  if (memory && !durable) {
    return { record: memory, source: "memory_cache", consistency: "ok" };
  }

  if (!memory || !durable) {
    return { record: null, source: null, consistency: "ok" };
  }

  if (sameContract(memory, durable)) {
    if (subscriptionUpdatedAtMs(memory) > subscriptionUpdatedAtMs(durable)) {
      return { record: memory, source: "memory_cache", consistency: "ok" };
    }
    return { record: durable, source: durableSource, consistency: "ok" };
  }

  if (isEphemeralFreeInvent(memory) && !isEphemeralFreeInvent(durable)) {
    return { record: durable, source: durableSource, consistency: "ok" };
  }

  if (isEphemeralFreeInvent(durable) && !isEphemeralFreeInvent(memory)) {
    return { record: memory, source: "memory_cache", consistency: "ok" };
  }

  const memoryMs = subscriptionUpdatedAtMs(memory);
  const durableMs = subscriptionUpdatedAtMs(durable);
  const bothPaidDifferentPlans =
    memory.planId !== "free" &&
    durable.planId !== "free" &&
    memory.planId !== durable.planId;

  if (
    bothPaidDifferentPlans &&
    Math.abs(memoryMs - durableMs) <= CONFLICT_WINDOW_MS
  ) {
    return { record: durable, source: durableSource, consistency: "conflict" };
  }

  if (durableMs >= memoryMs) {
    return { record: durable, source: durableSource, consistency: "ok" };
  }

  return { record: memory, source: "memory_cache", consistency: "ok" };
}

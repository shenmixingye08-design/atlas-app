import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { isPlanId } from "../plans/registry";
import type { PlanId } from "../plans/types";

import {
  findSubscriptionByStripeCustomerIdFromDurable,
  listSubscriptionsFromDurableDomain,
  loadSubscriptionFromDurableDomain,
  persistSubscriptionToDurableDomain,
} from "./durable-fallback";
import { isAtlasProduction } from "@/lib/runtime/is-production";
import {
  claimWebhookEventInMemory,
  getWebhookClaimLeaseMs,
  hasProcessedWebhookEventInMemory,
  markWebhookEventProcessedInMemory,
  releaseWebhookEventClaimInMemory,
  WEBHOOK_CLAIM_STATUS,
  type WebhookClaimResult,
} from "../stripe/webhook-claim-lease";
import { isBillingDedicatedTableReady } from "./table-ready";
import type { SubscriptionStatus, UserSubscriptionRecord } from "./types";

export type { WebhookClaimResult };

const CLERK_BILLING_KEY = "atlasBilling";

const SUBSCRIPTIONS_TABLE = "atlas_billing_subscriptions" as const;
const WEBHOOK_EVENTS_TABLE = "atlas_stripe_webhook_events" as const;

type BillingSubscriptionRow = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
  automations_suspended: boolean | null;
  payment_failure_grace_ends_at: string | null;
  plan_profile_synced_at: string | null;
};

export function isBillingSupabaseConfigured(): boolean {
  return createServiceRoleClientIfConfigured() !== null;
}

function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (
    value === "active" ||
    value === "trialing" ||
    value === "past_due" ||
    value === "canceled" ||
    value === "unpaid" ||
    value === "incomplete" ||
    value === "incomplete_expired"
  );
}

function rowToRecord(row: BillingSubscriptionRow): UserSubscriptionRecord | null {
  if (!isPlanId(row.plan_id) || !isSubscriptionStatus(row.status)) return null;

  return {
    userId: row.user_id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripePriceId: row.stripe_price_id,
    planId: row.plan_id as PlanId,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    updatedAt: row.updated_at,
    automationsSuspended: row.automations_suspended ?? undefined,
    paymentFailureGraceEndsAt: row.payment_failure_grace_ends_at,
    planProfileSyncedAt: row.plan_profile_synced_at,
  };
}

function recordToRow(record: UserSubscriptionRecord): BillingSubscriptionRow {
  return {
    user_id: record.userId,
    stripe_customer_id: record.stripeCustomerId,
    stripe_subscription_id: record.stripeSubscriptionId,
    stripe_price_id: record.stripePriceId,
    plan_id: record.planId,
    status: record.status,
    current_period_start: record.currentPeriodStart,
    current_period_end: record.currentPeriodEnd,
    cancel_at_period_end: record.cancelAtPeriodEnd,
    updated_at: record.updatedAt,
    automations_suspended: record.automationsSuspended ?? null,
    payment_failure_grace_ends_at: record.paymentFailureGraceEndsAt ?? null,
    plan_profile_synced_at: record.planProfileSyncedAt ?? null,
  };
}

export const writeSubscriptionsToDisk: (
  records: Map<string, UserSubscriptionRecord>,
) => void = () => undefined;

export function readSubscriptionsFromDisk(): Map<string, UserSubscriptionRecord> {
  return new Map();
}

export function readProcessedWebhookEventsFromDisk(): Set<string> {
  return new Set();
}

export const writeProcessedWebhookEventsToDisk: (
  eventIds: Set<string>,
) => void = () => undefined;

function isSubscriptionRecord(value: unknown): value is UserSubscriptionRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.userId === "string" && typeof row.planId === "string";
}

/**
 * Persist subscription to atlas_user_state domain atlasBilling
 * (supabase-only; does not write Clerk payloads).
 */
export async function persistSubscriptionToClerk(
  record: UserSubscriptionRecord,
): Promise<void> {
  const ok = await persistSubscriptionToDurableDomain(record);
  if (!ok) {
    console.error(
      "[billing] Failed to persist subscription durably to atlas_user_state",
    );
  }
}

/**
 * Load subscription: durable atlasBilling first, then legacy Clerk metadata.
 */
export async function loadSubscriptionFromClerk(
  userId: string,
): Promise<UserSubscriptionRecord | null> {
  const fromDurable = await loadSubscriptionFromDurableDomain(userId);
  if (fromDurable) return fromDurable;

  if (!process.env.CLERK_SECRET_KEY?.trim()) return null;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const billing = user.privateMetadata?.[CLERK_BILLING_KEY];
    return isSubscriptionRecord(billing) ? billing : null;
  } catch {
    return null;
  }
}

function isMissingBillingTableError(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table/i.test(message),
  );
}

/**
 * Prefer dedicated atlas_billing_subscriptions when present;
 * otherwise atlas_user_state domain atlasBilling (no schema-cache warn spam).
 */
export async function loadSubscriptionFromSupabase(
  userId: string,
): Promise<UserSubscriptionRecord | null> {
  if (!(await isBillingDedicatedTableReady())) {
    return loadSubscriptionFromDurableDomain(userId);
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) return loadSubscriptionFromDurableDomain(userId);

  try {
    const { data, error } = await client
      .from(SUBSCRIPTIONS_TABLE)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (isMissingBillingTableError(error.message)) {
        const { markBillingDedicatedTableReadyUnknown } = await import(
          "./table-ready"
        );
        markBillingDedicatedTableReadyUnknown();
        return loadSubscriptionFromDurableDomain(userId);
      }
      console.error(
        "[billing] Supabase subscription load failed:",
        error.message,
      );
      return loadSubscriptionFromDurableDomain(userId);
    }
    if (!data) return loadSubscriptionFromDurableDomain(userId);
    return rowToRecord(data as BillingSubscriptionRow);
  } catch (error) {
    console.error("[billing] Supabase subscription load skipped:", error);
    return loadSubscriptionFromDurableDomain(userId);
  }
}

export async function persistSubscriptionToSupabase(
  record: UserSubscriptionRecord,
): Promise<boolean> {
  // Always keep durable domain in sync (exists on Production today).
  const durableOk = await persistSubscriptionToDurableDomain(record);

  if (!(await isBillingDedicatedTableReady())) {
    return durableOk;
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) return durableOk;

  try {
    const { error } = await client
      .from(SUBSCRIPTIONS_TABLE)
      .upsert(recordToRow(record), { onConflict: "user_id" });

    if (error) {
      if (isMissingBillingTableError(error.message)) {
        const { markBillingDedicatedTableReadyUnknown } = await import(
          "./table-ready"
        );
        markBillingDedicatedTableReadyUnknown();
        return durableOk;
      }
      console.error(
        "[billing] Supabase subscription upsert failed:",
        error.message,
      );
      return durableOk;
    }
    return true;
  } catch (error) {
    console.error("[billing] Supabase subscription upsert skipped:", error);
    return durableOk;
  }
}

export async function findSubscriptionByStripeCustomerIdFromSupabase(
  stripeCustomerId: string,
): Promise<UserSubscriptionRecord | null> {
  if (!(await isBillingDedicatedTableReady())) {
    return findSubscriptionByStripeCustomerIdFromDurable(stripeCustomerId);
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    return findSubscriptionByStripeCustomerIdFromDurable(stripeCustomerId);
  }

  try {
    const { data, error } = await client
      .from(SUBSCRIPTIONS_TABLE)
      .select("*")
      .eq("stripe_customer_id", stripeCustomerId)
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingBillingTableError(error.message)) {
        const { markBillingDedicatedTableReadyUnknown } = await import(
          "./table-ready"
        );
        markBillingDedicatedTableReadyUnknown();
        return findSubscriptionByStripeCustomerIdFromDurable(stripeCustomerId);
      }
      console.error(
        "[billing] Supabase customer lookup failed:",
        error.message,
      );
      return findSubscriptionByStripeCustomerIdFromDurable(stripeCustomerId);
    }
    if (!data) {
      return findSubscriptionByStripeCustomerIdFromDurable(stripeCustomerId);
    }
    return rowToRecord(data as BillingSubscriptionRow);
  } catch {
    return findSubscriptionByStripeCustomerIdFromDurable(stripeCustomerId);
  }
}

export async function listSubscriptionsFromSupabase(): Promise<
  UserSubscriptionRecord[]
> {
  if (!(await isBillingDedicatedTableReady())) {
    return listSubscriptionsFromDurableDomain();
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) return listSubscriptionsFromDurableDomain();

  try {
    const { data, error } = await client.from(SUBSCRIPTIONS_TABLE).select("*");
    if (error || !data) {
      if (error && isMissingBillingTableError(error.message)) {
        const { markBillingDedicatedTableReadyUnknown } = await import(
          "./table-ready"
        );
        markBillingDedicatedTableReadyUnknown();
        return listSubscriptionsFromDurableDomain();
      }
      if (error) {
        console.error(
          "[billing] Supabase subscription list failed:",
          error.message,
        );
      }
      return listSubscriptionsFromDurableDomain();
    }

    return data
      .map((row) => rowToRecord(row as BillingSubscriptionRow))
      .filter((row): row is UserSubscriptionRecord => row !== null);
  } catch {
    return listSubscriptionsFromDurableDomain();
  }
}

/**
 * True only when the event is fully processed (not merely claimed/processing).
 * Production: dedicated table only — never non-atomic durable fallback.
 */
export async function hasProcessedWebhookEventInSupabase(
  eventId: string,
): Promise<boolean> {
  if (!(await isBillingDedicatedTableReady())) {
    if (isAtlasProduction()) return false;
    return hasProcessedWebhookEventInMemory(eventId);
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) return false;
    return hasProcessedWebhookEventInMemory(eventId);
  }

  try {
    const { data, error } = await client
      .from(WEBHOOK_EVENTS_TABLE)
      .select("event_id, status")
      .eq("event_id", eventId)
      .eq("status", WEBHOOK_CLAIM_STATUS.processed)
      .maybeSingle();

    if (error) {
      if (isMissingBillingTableError(error.message)) {
        const { markBillingDedicatedTableReadyUnknown } = await import(
          "./table-ready"
        );
        markBillingDedicatedTableReadyUnknown();
        if (isAtlasProduction()) return false;
        return hasProcessedWebhookEventInMemory(eventId);
      }
      // Missing status column (pre-lease schema) → fail closed in production.
      if (/column .*status/i.test(error.message ?? "")) {
        console.error(
          "[billing] webhook claim columns missing; treat as not processed",
        );
        return false;
      }
      console.error(
        "[billing] Supabase webhook idempotency check failed:",
        error.message,
      );
      return false;
    }
    return Boolean(data?.event_id);
  } catch {
    return false;
  }
}

/**
 * Mark processed only after handler success.
 * Production requires dedicated table — no durable fallback.
 */
export async function markWebhookEventProcessedInSupabase(
  eventId: string,
  eventType?: string | null,
): Promise<boolean> {
  if (!(await isBillingDedicatedTableReady())) {
    if (isAtlasProduction()) return false;
    markWebhookEventProcessedInMemory(eventId, eventType);
    return true;
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) return false;
    markWebhookEventProcessedInMemory(eventId, eventType);
    return true;
  }

  const now = new Date().toISOString();
  try {
    const { error } = await client.from(WEBHOOK_EVENTS_TABLE).upsert(
      {
        event_id: eventId,
        event_type: eventType ?? null,
        status: WEBHOOK_CLAIM_STATUS.processed,
        claimed_at: now,
        lease_expires_at: now,
        processed_at: now,
      },
      { onConflict: "event_id" },
    );

    if (error) {
      if (isMissingBillingTableError(error.message)) {
        const { markBillingDedicatedTableReadyUnknown } = await import(
          "./table-ready"
        );
        markBillingDedicatedTableReadyUnknown();
        if (isAtlasProduction()) return false;
        markWebhookEventProcessedInMemory(eventId, eventType);
        return true;
      }
      console.error(
        "[billing] Supabase webhook processed mark failed:",
        error.message,
      );
      return false;
    }
    if (!isAtlasProduction()) {
      markWebhookEventProcessedInMemory(eventId, eventType);
    }
    return true;
  } catch (error) {
    console.error(
      "[billing] Supabase webhook processed mark exception:",
      error,
    );
    return false;
  }
}

/**
 * P0 FINAL GATE: claim-before-process with processing lease.
 * - Insert status=processing + lease
 * - Conflict: processed → duplicate; fresh processing → in_progress; stale → reclaim
 * - Production: dedicated table required (no non-atomic durable fallback)
 */
export async function claimWebhookEventInSupabase(
  eventId: string,
  eventType?: string | null,
): Promise<WebhookClaimResult> {
  if (!(await isBillingDedicatedTableReady())) {
    if (isAtlasProduction()) {
      // Best-effort DDL ensure (Postgres URL / Management token). Still fail-closed if unusable.
      try {
        const { ensureBillingSubscriptionsSchema } = await import(
          "./schema-probe"
        );
        await ensureBillingSubscriptionsSchema();
      } catch (error) {
        console.error("[billing] webhook claim schema ensure failed:", error);
      }
      if (!(await isBillingDedicatedTableReady())) {
        return { ok: false, reason: "unavailable" };
      }
    } else {
      return claimWebhookEventInMemory(eventId, eventType);
    }
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (isAtlasProduction()) {
      return { ok: false, reason: "unavailable" };
    }
    return claimWebhookEventInMemory(eventId, eventType);
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const leaseExpiresIso = new Date(
    nowMs + getWebhookClaimLeaseMs(),
  ).toISOString();

  try {
    const { error } = await client.from(WEBHOOK_EVENTS_TABLE).insert({
      event_id: eventId,
      event_type: eventType ?? null,
      status: WEBHOOK_CLAIM_STATUS.processing,
      claimed_at: nowIso,
      lease_expires_at: leaseExpiresIso,
      processed_at: null,
    });

    if (!error) {
      return { ok: true, claimed: true };
    }

    const uniqueConflict =
      error.code === "23505" ||
      /duplicate|unique/i.test(error.message ?? "");

    if (!uniqueConflict) {
      if (isMissingBillingTableError(error.message)) {
        const { markBillingDedicatedTableReadyUnknown } = await import(
          "./table-ready"
        );
        markBillingDedicatedTableReadyUnknown();
        if (isAtlasProduction()) {
          return { ok: false, reason: "unavailable" };
        }
        return claimWebhookEventInMemory(eventId, eventType);
      }
      if (/column .*status|lease_expires_at|claimed_at/i.test(error.message ?? "")) {
        console.error(
          "[billing] webhook claim lease columns missing — fail closed",
          error.message,
        );
        return { ok: false, reason: "unavailable" };
      }
      console.error("[billing] Supabase webhook claim failed:", error.message);
      return { ok: false, reason: "unavailable" };
    }

    // Conflict: inspect existing row for processed / in-progress / stale reclaim.
    const { data: existing, error: readError } = await client
      .from(WEBHOOK_EVENTS_TABLE)
      .select("event_id, status, lease_expires_at")
      .eq("event_id", eventId)
      .maybeSingle();

    if (readError || !existing) {
      console.error(
        "[billing] webhook claim conflict read failed:",
        readError?.message ?? "missing_row",
      );
      return { ok: false, reason: "unavailable" };
    }

    if (existing.status === WEBHOOK_CLAIM_STATUS.processed) {
      return { ok: true, claimed: false, reason: "duplicate" };
    }

    const leaseExpiresAt = Date.parse(
      String(existing.lease_expires_at ?? ""),
    );
    if (
      existing.status === WEBHOOK_CLAIM_STATUS.processing &&
      Number.isFinite(leaseExpiresAt) &&
      leaseExpiresAt > nowMs
    ) {
      return { ok: true, claimed: false, reason: "in_progress" };
    }

    // Stale processing (or unknown status) → atomic reclaim.
    const { data: reclaimed, error: reclaimError } = await client
      .from(WEBHOOK_EVENTS_TABLE)
      .update({
        event_type: eventType ?? null,
        status: WEBHOOK_CLAIM_STATUS.processing,
        claimed_at: nowIso,
        lease_expires_at: leaseExpiresIso,
        processed_at: null,
      })
      .eq("event_id", eventId)
      .eq("status", WEBHOOK_CLAIM_STATUS.processing)
      .lt("lease_expires_at", nowIso)
      .select("event_id")
      .maybeSingle();

    if (reclaimError) {
      console.error(
        "[billing] webhook stale claim reclaim failed:",
        reclaimError.message,
      );
      return { ok: false, reason: "unavailable" };
    }

    if (reclaimed?.event_id) {
      return { ok: true, claimed: true };
    }

    // Lost race to another reclaim/process — treat as in-progress (Stripe retries).
    return { ok: true, claimed: false, reason: "in_progress" };
  } catch (error) {
    console.error("[billing] Supabase webhook claim exception:", error);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Release processing claim so Stripe can retry.
 * Never deletes a processed row.
 */
export async function releaseWebhookEventClaimInSupabase(
  eventId: string,
): Promise<void> {
  if (!(await isBillingDedicatedTableReady())) {
    if (!isAtlasProduction()) {
      releaseWebhookEventClaimInMemory(eventId);
    }
    return;
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    if (!isAtlasProduction()) {
      releaseWebhookEventClaimInMemory(eventId);
    }
    return;
  }

  try {
    const { error } = await client
      .from(WEBHOOK_EVENTS_TABLE)
      .delete()
      .eq("event_id", eventId)
      .eq("status", WEBHOOK_CLAIM_STATUS.processing);
    if (error && !isMissingBillingTableError(error.message)) {
      console.error(
        "[billing] Supabase webhook claim release failed:",
        error.message,
      );
    }
  } catch (error) {
    console.error("[billing] Supabase webhook claim release exception:", error);
  }

  if (!isAtlasProduction()) {
    releaseWebhookEventClaimInMemory(eventId);
  }
}

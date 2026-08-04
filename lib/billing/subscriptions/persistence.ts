import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { isPlanId } from "../plans/registry";
import type { PlanId } from "../plans/types";

import {
  findSubscriptionByStripeCustomerIdFromDurable,
  hasProcessedWebhookEventInDurable,
  listSubscriptionsFromDurableDomain,
  loadSubscriptionFromDurableDomain,
  markWebhookEventProcessedInDurable,
  persistSubscriptionToDurableDomain,
} from "./durable-fallback";
import { isBillingDedicatedTableReady } from "./table-ready";
import type { SubscriptionStatus, UserSubscriptionRecord } from "./types";

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

export async function hasProcessedWebhookEventInSupabase(
  eventId: string,
): Promise<boolean> {
  if (!(await isBillingDedicatedTableReady())) {
    return hasProcessedWebhookEventInDurable(eventId);
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) return hasProcessedWebhookEventInDurable(eventId);

  try {
    const { data, error } = await client
      .from(WEBHOOK_EVENTS_TABLE)
      .select("event_id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (error) {
      if (isMissingBillingTableError(error.message)) {
        const { markBillingDedicatedTableReadyUnknown } = await import(
          "./table-ready"
        );
        markBillingDedicatedTableReadyUnknown();
        return hasProcessedWebhookEventInDurable(eventId);
      }
      console.error(
        "[billing] Supabase webhook idempotency check failed:",
        error.message,
      );
      return hasProcessedWebhookEventInDurable(eventId);
    }
    return Boolean(data?.event_id);
  } catch {
    return hasProcessedWebhookEventInDurable(eventId);
  }
}

export async function markWebhookEventProcessedInSupabase(
  eventId: string,
  eventType?: string | null,
): Promise<boolean> {
  // Always durable-mark so idempotency survives without dedicated table.
  const durableOk = await markWebhookEventProcessedInDurable(eventId, eventType);

  if (!(await isBillingDedicatedTableReady())) {
    return durableOk;
  }

  const client = createServiceRoleClientIfConfigured();
  if (!client) return durableOk;

  try {
    const { error } = await client.from(WEBHOOK_EVENTS_TABLE).upsert(
      {
        event_id: eventId,
        event_type: eventType ?? null,
        processed_at: new Date().toISOString(),
      },
      { onConflict: "event_id" },
    );

    if (error) {
      if (isMissingBillingTableError(error.message)) {
        const { markBillingDedicatedTableReadyUnknown } = await import(
          "./table-ready"
        );
        markBillingDedicatedTableReadyUnknown();
        return durableOk;
      }
      console.error(
        "[billing] Supabase webhook idempotency write failed:",
        error.message,
      );
      return durableOk;
    }
    return true;
  } catch (error) {
    console.error(
      "[billing] Supabase webhook idempotency write skipped:",
      error,
    );
    return durableOk;
  }
}

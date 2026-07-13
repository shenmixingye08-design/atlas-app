import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

import { clerkClient } from "@clerk/nextjs/server";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { isPlanId } from "../plans/registry";
import type { PlanId } from "../plans/types";

import type { SubscriptionStatus, UserSubscriptionRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data", "billing");
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "subscriptions.json");
const WEBHOOK_EVENTS_FILE = path.join(DATA_DIR, "processed-webhook-events.json");

const CLERK_BILLING_KEY = "atlasBilling";

const SUBSCRIPTIONS_TABLE = "atlas_billing_subscriptions" as const;
const WEBHOOK_EVENTS_TABLE = "atlas_stripe_webhook_events" as const;

type SubscriptionFileShape = {
  version: 1;
  records: Record<string, UserSubscriptionRecord>;
};

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

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/** Local/dev disk fallback only — never relied on for production correctness. */
function allowDiskFallback(): boolean {
  return !isAtlasProduction();
}

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

export function readSubscriptionsFromDisk(): Map<string, UserSubscriptionRecord> {
  if (!allowDiskFallback()) return new Map();

  try {
    if (!existsSync(SUBSCRIPTIONS_FILE)) return new Map();
    const raw = readFileSync(SUBSCRIPTIONS_FILE, "utf8");
    const parsed = JSON.parse(raw) as SubscriptionFileShape;
    if (!parsed?.records || typeof parsed.records !== "object") return new Map();
    return new Map(Object.entries(parsed.records));
  } catch {
    return new Map();
  }
}

export function writeSubscriptionsToDisk(
  records: Map<string, UserSubscriptionRecord>,
): void {
  if (!allowDiskFallback()) return;

  try {
    ensureDataDir();
    const payload: SubscriptionFileShape = {
      version: 1,
      records: Object.fromEntries(records.entries()),
    };
    writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    console.error("[billing] Failed to persist subscriptions to disk:", error);
  }
}

export function readProcessedWebhookEventsFromDisk(): Set<string> {
  if (!allowDiskFallback()) return new Set();

  try {
    if (!existsSync(WEBHOOK_EVENTS_FILE)) return new Set();
    const raw = readFileSync(WEBHOOK_EVENTS_FILE, "utf8");
    const parsed = JSON.parse(raw) as { eventIds?: string[] };
    return new Set(Array.isArray(parsed.eventIds) ? parsed.eventIds : []);
  } catch {
    return new Set();
  }
}

export function writeProcessedWebhookEventsToDisk(eventIds: Set<string>): void {
  if (!allowDiskFallback()) return;

  try {
    ensureDataDir();
    const ids = [...eventIds].slice(-2000);
    writeFileSync(
      WEBHOOK_EVENTS_FILE,
      JSON.stringify({ version: 1, eventIds: ids }, null, 2),
      "utf8",
    );
  } catch (error) {
    console.error("[billing] Failed to persist webhook idempotency:", error);
  }
}

function isSubscriptionRecord(value: unknown): value is UserSubscriptionRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.userId === "string" && typeof row.planId === "string";
}

/** Best-effort durable copy on Clerk privateMetadata (survives serverless restarts). */
export async function persistSubscriptionToClerk(
  record: UserSubscriptionRecord,
): Promise<void> {
  if (!process.env.CLERK_SECRET_KEY?.trim()) return;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(record.userId);
    const existing =
      user.privateMetadata && typeof user.privateMetadata === "object"
        ? { ...user.privateMetadata }
        : {};

    await client.users.updateUserMetadata(record.userId, {
      privateMetadata: {
        ...existing,
        [CLERK_BILLING_KEY]: record,
      },
    });
  } catch (error) {
    console.error("[billing] Failed to persist subscription to Clerk:", error);
  }
}

export async function loadSubscriptionFromClerk(
  userId: string,
): Promise<UserSubscriptionRecord | null> {
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

/** Prefer Supabase as source of truth when service role is configured. */
export async function loadSubscriptionFromSupabase(
  userId: string,
): Promise<UserSubscriptionRecord | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from(SUBSCRIPTIONS_TABLE)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.warn(
        "[billing] Supabase subscription load failed:",
        error.message,
      );
      return null;
    }
    if (!data) return null;
    return rowToRecord(data as BillingSubscriptionRow);
  } catch (error) {
    console.warn("[billing] Supabase subscription load skipped:", error);
    return null;
  }
}

export async function persistSubscriptionToSupabase(
  record: UserSubscriptionRecord,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  try {
    const { error } = await client
      .from(SUBSCRIPTIONS_TABLE)
      .upsert(recordToRow(record), { onConflict: "user_id" });

    if (error) {
      console.warn(
        "[billing] Supabase subscription upsert failed:",
        error.message,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[billing] Supabase subscription upsert skipped:", error);
    return false;
  }
}

export async function findSubscriptionByStripeCustomerIdFromSupabase(
  stripeCustomerId: string,
): Promise<UserSubscriptionRecord | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from(SUBSCRIPTIONS_TABLE)
      .select("*")
      .eq("stripe_customer_id", stripeCustomerId)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn(
        "[billing] Supabase customer lookup failed:",
        error.message,
      );
      return null;
    }
    if (!data) return null;
    return rowToRecord(data as BillingSubscriptionRow);
  } catch {
    return null;
  }
}

export async function listSubscriptionsFromSupabase(): Promise<
  UserSubscriptionRecord[]
> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return [];

  try {
    const { data, error } = await client.from(SUBSCRIPTIONS_TABLE).select("*");
    if (error || !data) {
      if (error) {
        console.warn(
          "[billing] Supabase subscription list failed:",
          error.message,
        );
      }
      return [];
    }

    return data
      .map((row) => rowToRecord(row as BillingSubscriptionRow))
      .filter((row): row is UserSubscriptionRecord => row !== null);
  } catch {
    return [];
  }
}

export async function hasProcessedWebhookEventInSupabase(
  eventId: string,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

  try {
    const { data, error } = await client
      .from(WEBHOOK_EVENTS_TABLE)
      .select("event_id")
      .eq("event_id", eventId)
      .maybeSingle();

    if (error) {
      console.warn(
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

export async function markWebhookEventProcessedInSupabase(
  eventId: string,
  eventType?: string | null,
): Promise<boolean> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) return false;

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
      console.warn(
        "[billing] Supabase webhook idempotency write failed:",
        error.message,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[billing] Supabase webhook idempotency write skipped:", error);
    return false;
  }
}

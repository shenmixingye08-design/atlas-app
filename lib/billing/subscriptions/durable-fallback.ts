import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import {
  loadSupabaseUserState,
  listSupabaseUserIdsForDomain,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

import type { UserSubscriptionRecord } from "./types";

/** Matches SUPABASE_ONLY_DOMAIN_KEYS / persistSubscriptionToClerk. */
export const BILLING_SUBSCRIPTION_DOMAIN = "atlasBilling" as const;

const CUSTOMER_INDEX_USER_ID = "__atlas_billing_customer_index__";
const CUSTOMER_INDEX_DOMAIN = "atlasBillingCustomerIndex";

const WEBHOOK_EVENTS_USER_ID = "__atlas_stripe_webhook_events__";
const WEBHOOK_EVENTS_DOMAIN = "atlasStripeWebhookEvents";

type CustomerIndexPayload = {
  version: 1;
  updatedAt: string;
  byCustomerId: Record<string, string>;
};

type WebhookEventsPayload = {
  version: 1;
  updatedAt: string;
  /** eventId -> { type, processedAt } — capped */
  events: Record<string, { type: string | null; processedAt: string }>;
};

const MAX_WEBHOOK_EVENTS = 5000;

function isSubscriptionRecord(value: unknown): value is UserSubscriptionRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.userId === "string" && typeof row.planId === "string";
}

export async function loadSubscriptionFromDurableDomain(
  userId: string,
): Promise<UserSubscriptionRecord | null> {
  try {
    const payload = await loadDurableDomain<UserSubscriptionRecord>(
      userId,
      BILLING_SUBSCRIPTION_DOMAIN,
    );
    return isSubscriptionRecord(payload) ? payload : null;
  } catch (error) {
    console.error("[billing] durable subscription load failed:", error);
    return null;
  }
}

export async function persistSubscriptionToDurableDomain(
  record: UserSubscriptionRecord,
): Promise<boolean> {
  try {
    const result = await persistDurableDomain(
      record.userId,
      BILLING_SUBSCRIPTION_DOMAIN,
      record,
      {
        forceSupabase: true,
        compact: (r) => r,
      },
    );
    if (result === "skipped") return false;
    if (record.stripeCustomerId) {
      await upsertCustomerIndex(record.stripeCustomerId, record.userId);
    }
    return true;
  } catch (error) {
    console.error("[billing] durable subscription persist failed:", error);
    return false;
  }
}

async function loadCustomerIndex(): Promise<CustomerIndexPayload> {
  const loaded = await loadSupabaseUserState<{
    payload?: CustomerIndexPayload;
  }>(CUSTOMER_INDEX_USER_ID, CUSTOMER_INDEX_DOMAIN);
  const root = loaded?.payload;
  const payload =
    root && typeof root === "object" && "byCustomerId" in root
      ? (root as CustomerIndexPayload)
      : root &&
          typeof root === "object" &&
          "payload" in root &&
          root.payload &&
          typeof root.payload === "object" &&
          "byCustomerId" in (root.payload as object)
        ? (root.payload as CustomerIndexPayload)
        : null;
  return (
    payload ?? {
      version: 1,
      updatedAt: new Date().toISOString(),
      byCustomerId: {},
    }
  );
}

async function upsertCustomerIndex(
  stripeCustomerId: string,
  userId: string,
): Promise<void> {
  const current = await loadCustomerIndex();
  if (current.byCustomerId[stripeCustomerId] === userId) return;
  current.byCustomerId[stripeCustomerId] = userId;
  current.updatedAt = new Date().toISOString();
  await upsertSupabaseUserState(CUSTOMER_INDEX_USER_ID, CUSTOMER_INDEX_DOMAIN, {
    version: 1,
    updatedAt: current.updatedAt,
    payload: current,
  });
}

export async function findSubscriptionByStripeCustomerIdFromDurable(
  stripeCustomerId: string,
): Promise<UserSubscriptionRecord | null> {
  const index = await loadCustomerIndex();
  const mappedUserId = index.byCustomerId[stripeCustomerId];
  if (mappedUserId) {
    return loadSubscriptionFromDurableDomain(mappedUserId);
  }

  // Slow path: scan atlasBilling domain rows (webhook-only; rare).
  const userIds = await listSupabaseUserIdsForDomain(BILLING_SUBSCRIPTION_DOMAIN);
  for (const userId of userIds) {
    if (userId.startsWith("__")) continue;
    const record = await loadSubscriptionFromDurableDomain(userId);
    if (record?.stripeCustomerId === stripeCustomerId) {
      await upsertCustomerIndex(stripeCustomerId, userId);
      return record;
    }
  }
  return null;
}

export async function listSubscriptionsFromDurableDomain(): Promise<
  UserSubscriptionRecord[]
> {
  const userIds = await listSupabaseUserIdsForDomain(BILLING_SUBSCRIPTION_DOMAIN);
  const out: UserSubscriptionRecord[] = [];
  for (const userId of userIds) {
    if (userId.startsWith("__")) continue;
    const record = await loadSubscriptionFromDurableDomain(userId);
    if (record) out.push(record);
  }
  return out;
}

async function loadWebhookEventsPayload(): Promise<WebhookEventsPayload> {
  const loaded = await loadSupabaseUserState<{
    payload?: WebhookEventsPayload;
  }>(WEBHOOK_EVENTS_USER_ID, WEBHOOK_EVENTS_DOMAIN);
  const root = loaded?.payload;
  const payload =
    root && typeof root === "object" && "events" in root
      ? (root as WebhookEventsPayload)
      : root &&
          typeof root === "object" &&
          "payload" in root &&
          root.payload &&
          typeof root.payload === "object" &&
          "events" in (root.payload as object)
        ? (root.payload as WebhookEventsPayload)
        : null;
  return (
    payload ?? {
      version: 1,
      updatedAt: new Date().toISOString(),
      events: {},
    }
  );
}

export async function hasProcessedWebhookEventInDurable(
  eventId: string,
): Promise<boolean> {
  const payload = await loadWebhookEventsPayload();
  return Boolean(payload.events[eventId]);
}

/**
 * @deprecated P0 FINAL GATE: non-atomic. Do NOT use for Production webhook mutex.
 * Production must use atlas_stripe_webhook_events claim lease (or 503 fail-closed).
 * Kept only for legacy non-production tooling / tests of durable blob helpers.
 */
export async function claimWebhookEventInDurable(
  eventId: string,
  eventType?: string | null,
): Promise<boolean> {
  const payload = await loadWebhookEventsPayload();
  if (payload.events[eventId]) return false;
  payload.events[eventId] = {
    type: eventType ?? null,
    processedAt: new Date().toISOString(),
  };
  const keys = Object.keys(payload.events);
  if (keys.length > MAX_WEBHOOK_EVENTS) {
    const sorted = keys.sort(
      (a, b) =>
        (payload.events[a]?.processedAt ?? "").localeCompare(
          payload.events[b]?.processedAt ?? "",
        ),
    );
    for (const key of sorted.slice(0, keys.length - MAX_WEBHOOK_EVENTS)) {
      delete payload.events[key];
    }
  }
  payload.updatedAt = new Date().toISOString();
  // Best-effort durable mirror — local claim win is authoritative for this path.
  await upsertSupabaseUserState(WEBHOOK_EVENTS_USER_ID, WEBHOOK_EVENTS_DOMAIN, {
    version: 1,
    updatedAt: payload.updatedAt,
    payload,
  });
  return true;
}

/** Release a claim so Stripe can retry after a failed handler. */
export async function releaseWebhookEventClaimInDurable(
  eventId: string,
): Promise<void> {
  const payload = await loadWebhookEventsPayload();
  if (!payload.events[eventId]) return;
  delete payload.events[eventId];
  payload.updatedAt = new Date().toISOString();
  await upsertSupabaseUserState(WEBHOOK_EVENTS_USER_ID, WEBHOOK_EVENTS_DOMAIN, {
    version: 1,
    updatedAt: payload.updatedAt,
    payload,
  });
}

export async function markWebhookEventProcessedInDurable(
  eventId: string,
  eventType?: string | null,
): Promise<boolean> {
  const payload = await loadWebhookEventsPayload();
  payload.events[eventId] = {
    type: eventType ?? null,
    processedAt: new Date().toISOString(),
  };
  const keys = Object.keys(payload.events);
  if (keys.length > MAX_WEBHOOK_EVENTS) {
    const sorted = keys.sort(
      (a, b) =>
        (payload.events[a]?.processedAt ?? "").localeCompare(
          payload.events[b]?.processedAt ?? "",
        ),
    );
    for (const key of sorted.slice(0, keys.length - MAX_WEBHOOK_EVENTS)) {
      delete payload.events[key];
    }
  }
  payload.updatedAt = new Date().toISOString();
  return upsertSupabaseUserState(WEBHOOK_EVENTS_USER_ID, WEBHOOK_EVENTS_DOMAIN, {
    version: 1,
    updatedAt: payload.updatedAt,
    payload,
  });
}

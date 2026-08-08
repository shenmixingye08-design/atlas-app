import "server-only";

import { warnIfProductionSupabaseServiceRoleMissing } from "@/lib/persistence/production-guard";

import {
  claimWebhookEventInSupabase,
  hasProcessedWebhookEventInSupabase,
  isBillingSupabaseConfigured,
  markWebhookEventProcessedInSupabase,
  readProcessedWebhookEventsFromDisk,
  releaseWebhookEventClaimInSupabase,
  writeProcessedWebhookEventsToDisk,
  type WebhookClaimResult,
} from "../subscriptions/persistence";

type ProcessedEventBucket = Set<string>;

function getBucket(): ProcessedEventBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasStripeProcessedWebhookEvents?: ProcessedEventBucket;
    __atlasStripeProcessedWebhookEventsHydrated?: boolean;
    __atlasStripeClaimingWebhookEvents?: Set<string>;
  };

  if (!globalScope.__atlasStripeProcessedWebhookEvents) {
    globalScope.__atlasStripeProcessedWebhookEvents = new Set();
  }

  if (!globalScope.__atlasStripeProcessedWebhookEventsHydrated) {
    for (const id of readProcessedWebhookEventsFromDisk()) {
      globalScope.__atlasStripeProcessedWebhookEvents.add(id);
    }
    globalScope.__atlasStripeProcessedWebhookEventsHydrated = true;
  }

  return globalScope.__atlasStripeProcessedWebhookEvents;
}

function getClaimingBucket(): Set<string> {
  const globalScope = globalThis as typeof globalThis & {
    __atlasStripeClaimingWebhookEvents?: Set<string>;
  };
  if (!globalScope.__atlasStripeClaimingWebhookEvents) {
    globalScope.__atlasStripeClaimingWebhookEvents = new Set();
  }
  return globalScope.__atlasStripeClaimingWebhookEvents;
}

/**
 * Durable-first idempotency check.
 * Memory/disk are process-local; Supabase is the production source of truth.
 */
export async function hasProcessedStripeEvent(eventId: string): Promise<boolean> {
  if (getBucket().has(eventId)) return true;

  const durable = await hasProcessedWebhookEventInSupabase(eventId);
  if (durable) {
    getBucket().add(eventId);
    return true;
  }

  return false;
}

/**
 * P0-06: claim-before-process.
 * Only `{ claimed: true }` may run billing side effects.
 */
export async function claimStripeEventForProcessing(
  eventId: string,
  eventType?: string | null,
): Promise<WebhookClaimResult> {
  const claiming = getClaimingBucket();
  if (claiming.has(eventId) || getBucket().has(eventId)) {
    return { ok: true, claimed: false, reason: "duplicate" };
  }
  // Process-local mutex (single-threaded) before durable claim.
  claiming.add(eventId);

  try {
    if (!isBillingSupabaseConfigured()) {
      warnIfProductionSupabaseServiceRoleMissing("atlas_stripe_webhook_events");
    }

    const result = await claimWebhookEventInSupabase(eventId, eventType);
    if (!result.ok) {
      claiming.delete(eventId);
      return result;
    }
    if (!result.claimed) {
      claiming.delete(eventId);
      getBucket().add(eventId);
      return result;
    }
    getBucket().add(eventId);
    writeProcessedWebhookEventsToDisk(getBucket());
    return result;
  } catch (error) {
    claiming.delete(eventId);
    throw error;
  }
}

/** Release claim after handler failure so Stripe can retry safely. */
export async function releaseStripeEventClaim(eventId: string): Promise<void> {
  getClaimingBucket().delete(eventId);
  getBucket().delete(eventId);
  writeProcessedWebhookEventsToDisk(getBucket());
  await releaseWebhookEventClaimInSupabase(eventId);
}

/**
 * Mark after successful handler (allows Stripe retries on failure via release).
 * Writes Supabase when configured; disk only in non-production fallback.
 */
export async function markStripeEventProcessed(
  eventId: string,
  eventType?: string | null,
): Promise<void> {
  const bucket = getBucket();
  bucket.add(eventId);
  getClaimingBucket().delete(eventId);
  writeProcessedWebhookEventsToDisk(bucket);

  if (!isBillingSupabaseConfigured()) {
    warnIfProductionSupabaseServiceRoleMissing("atlas_stripe_webhook_events");
    return;
  }

  await markWebhookEventProcessedInSupabase(eventId, eventType);
}

export function resetProcessedStripeEvents(): void {
  const bucket = getBucket();
  bucket.clear();
  getClaimingBucket().clear();
  writeProcessedWebhookEventsToDisk(bucket);
}

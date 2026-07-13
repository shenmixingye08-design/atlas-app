import "server-only";

import { warnIfProductionSupabaseServiceRoleMissing } from "@/lib/persistence/production-guard";

import {
  hasProcessedWebhookEventInSupabase,
  isBillingSupabaseConfigured,
  markWebhookEventProcessedInSupabase,
  readProcessedWebhookEventsFromDisk,
  writeProcessedWebhookEventsToDisk,
} from "../subscriptions/persistence";

type ProcessedEventBucket = Set<string>;

function getBucket(): ProcessedEventBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasStripeProcessedWebhookEvents?: ProcessedEventBucket;
    __atlasStripeProcessedWebhookEventsHydrated?: boolean;
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
 * Mark after successful handler (allows Stripe retries on failure).
 * Writes Supabase when configured; disk only in non-production fallback.
 */
export async function markStripeEventProcessed(
  eventId: string,
  eventType?: string | null,
): Promise<void> {
  const bucket = getBucket();
  bucket.add(eventId);
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
  writeProcessedWebhookEventsToDisk(bucket);
}

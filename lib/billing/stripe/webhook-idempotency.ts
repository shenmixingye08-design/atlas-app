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

function getInFlight(): Set<string> {
  const globalScope = globalThis as typeof globalThis & {
    __atlasStripeWebhookInFlight?: Set<string>;
  };
  if (!globalScope.__atlasStripeWebhookInFlight) {
    globalScope.__atlasStripeWebhookInFlight = new Set();
  }
  return globalScope.__atlasStripeWebhookInFlight;
}

/**
 * Durable-first idempotency check.
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
 * Claim before handler. Does NOT durable-mark until success
 * (so Stripe can retry failed handlers). Same-process races use in-flight set.
 */
export async function claimStripeEventForProcessing(
  eventId: string,
  _eventType?: string | null
): Promise<"claimed" | "duplicate" | "in_flight"> {
  if (await hasProcessedStripeEvent(eventId)) return "duplicate";

  const inFlight = getInFlight();
  if (inFlight.has(eventId)) return "in_flight";
  inFlight.add(eventId);
  return "claimed";
}

export function releaseStripeEventClaim(eventId: string): void {
  getInFlight().delete(eventId);
}

export async function markStripeEventProcessed(
  eventId: string,
  eventType?: string | null
): Promise<void> {
  const bucket = getBucket();
  bucket.add(eventId);
  writeProcessedWebhookEventsToDisk(bucket);
  getInFlight().delete(eventId);

  if (!isBillingSupabaseConfigured()) {
    warnIfProductionSupabaseServiceRoleMissing("atlas_stripe_webhook_events");
    return;
  }

  await markWebhookEventProcessedInSupabase(eventId, eventType);
}

export function resetProcessedStripeEvents(): void {
  const bucket = getBucket();
  bucket.clear();
  getInFlight().clear();
  writeProcessedWebhookEventsToDisk(bucket);
}

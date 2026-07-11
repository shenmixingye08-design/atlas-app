import "server-only";

import {
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

export function hasProcessedStripeEvent(eventId: string): boolean {
  return getBucket().has(eventId);
}

export function markStripeEventProcessed(eventId: string): void {
  const bucket = getBucket();
  bucket.add(eventId);
  writeProcessedWebhookEventsToDisk(bucket);
}

export function resetProcessedStripeEvents(): void {
  const bucket = getBucket();
  bucket.clear();
  writeProcessedWebhookEventsToDisk(bucket);
}

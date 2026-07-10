import "server-only";

type ProcessedEventBucket = Set<string>;

function getBucket(): ProcessedEventBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasStripeProcessedWebhookEvents?: ProcessedEventBucket;
  };

  if (!globalScope.__atlasStripeProcessedWebhookEvents) {
    globalScope.__atlasStripeProcessedWebhookEvents = new Set();
  }

  return globalScope.__atlasStripeProcessedWebhookEvents;
}

export function hasProcessedStripeEvent(eventId: string): boolean {
  return getBucket().has(eventId);
}

export function markStripeEventProcessed(eventId: string): void {
  getBucket().add(eventId);
}

export function resetProcessedStripeEvents(): void {
  getBucket().clear();
}

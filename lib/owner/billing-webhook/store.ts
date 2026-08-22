import type { StripeWebhookLogEntry } from "./types";

type WebhookLogBucket = Map<string, StripeWebhookLogEntry>;

function getBucket(): WebhookLogBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasStripeWebhookLogStore?: WebhookLogBucket;
  };

  if (!globalScope.__atlasStripeWebhookLogStore) {
    globalScope.__atlasStripeWebhookLogStore = new Map();
  } else if (Array.isArray(globalScope.__atlasStripeWebhookLogStore)) {
    // Legacy array store from before durable unique-by-event-id.
    const legacy = globalScope.__atlasStripeWebhookLogStore as unknown as StripeWebhookLogEntry[];
    const map = new Map<string, StripeWebhookLogEntry>();
    for (const entry of legacy) {
      if (entry?.stripeEventId && !map.has(entry.stripeEventId)) {
        map.set(entry.stripeEventId, entry);
      }
    }
    globalScope.__atlasStripeWebhookLogStore = map;
  }

  return globalScope.__atlasStripeWebhookLogStore;
}

export function upsertStripeWebhookLog(
  entry: StripeWebhookLogEntry,
): { entry: StripeWebhookLogEntry; inserted: boolean } {
  const bucket = getBucket();
  const existing = bucket.get(entry.stripeEventId);
  if (existing) {
    return { entry: existing, inserted: false };
  }
  bucket.set(entry.stripeEventId, entry);
  return { entry, inserted: true };
}

export function replaceStripeWebhookLogs(
  entries: readonly StripeWebhookLogEntry[],
): void {
  const bucket = getBucket();
  bucket.clear();
  for (const entry of entries) {
    if (!entry?.stripeEventId) continue;
    if (!bucket.has(entry.stripeEventId)) {
      bucket.set(entry.stripeEventId, entry);
    }
  }
}

export function listStripeWebhookLogs(): StripeWebhookLogEntry[] {
  return [...getBucket().values()].sort((a, b) =>
    a.processedAt < b.processedAt ? 1 : a.processedAt > b.processedAt ? -1 : 0,
  );
}

export function resetStripeWebhookLogStore(): void {
  getBucket().clear();
}

/** @deprecated Use upsertStripeWebhookLog — kept for transitional imports. */
export function appendStripeWebhookLog(
  entry: StripeWebhookLogEntry,
): StripeWebhookLogEntry {
  return upsertStripeWebhookLog(entry).entry;
}

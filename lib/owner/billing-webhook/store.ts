import type { StripeWebhookLogEntry } from "./types";

type WebhookLogBucket = StripeWebhookLogEntry[];

function getBucket(): WebhookLogBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasStripeWebhookLogStore?: WebhookLogBucket;
  };

  if (!globalScope.__atlasStripeWebhookLogStore) {
    globalScope.__atlasStripeWebhookLogStore = [];
  }

  return globalScope.__atlasStripeWebhookLogStore;
}

export function appendStripeWebhookLog(
  entry: StripeWebhookLogEntry,
): StripeWebhookLogEntry {
  getBucket().unshift(entry);
  if (getBucket().length > 300) {
    getBucket().length = 300;
  }
  return entry;
}

export function listStripeWebhookLogs(): StripeWebhookLogEntry[] {
  return [...getBucket()];
}

export function resetStripeWebhookLogStore(): void {
  getBucket().length = 0;
}

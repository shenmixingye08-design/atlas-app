import "server-only";

/**
 * P0 FINAL GATE: webhook claim lease constants + in-memory store for tests/dev.
 * Production hot path uses atlas_stripe_webhook_events (atomic insert/update).
 */

export const WEBHOOK_CLAIM_STATUS = {
  processing: "processing",
  processed: "processed",
} as const;

export type WebhookClaimStatus =
  (typeof WEBHOOK_CLAIM_STATUS)[keyof typeof WEBHOOK_CLAIM_STATUS];

/** Default lease: longer than typical serverless webhook maxDuration. */
export const DEFAULT_WEBHOOK_CLAIM_LEASE_MS = 120_000;

export type WebhookClaimResult =
  | { ok: true; claimed: true }
  | { ok: true; claimed: false; reason: "duplicate" | "in_progress" }
  | { ok: false; reason: "unavailable" };

type MemoryClaim = {
  status: WebhookClaimStatus;
  eventType: string | null;
  claimedAtMs: number;
  leaseExpiresAtMs: number;
  processedAtMs: number | null;
};

function getMemoryStore(): Map<string, MemoryClaim> {
  const globalScope = globalThis as typeof globalThis & {
    __atlasStripeWebhookClaimLeaseStore?: Map<string, MemoryClaim>;
  };
  if (!globalScope.__atlasStripeWebhookClaimLeaseStore) {
    globalScope.__atlasStripeWebhookClaimLeaseStore = new Map();
  }
  return globalScope.__atlasStripeWebhookClaimLeaseStore;
}

let leaseMsForTests: number | null = null;

export function getWebhookClaimLeaseMs(): number {
  return leaseMsForTests ?? DEFAULT_WEBHOOK_CLAIM_LEASE_MS;
}

/** Test-only: shorten lease to exercise reclaim without waiting. */
export function setWebhookClaimLeaseMsForTests(ms: number | null): void {
  leaseMsForTests = ms;
}

export function resetWebhookClaimLeaseStoreForTests(): void {
  getMemoryStore().clear();
  leaseMsForTests = null;
}

/** Test-only: force a processing claim to be stale immediately. */
export function expireWebhookClaimLeaseForTests(eventId: string): void {
  const entry = getMemoryStore().get(eventId);
  if (!entry || entry.status !== WEBHOOK_CLAIM_STATUS.processing) return;
  entry.leaseExpiresAtMs = Date.now() - 1;
}

export function hasProcessedWebhookEventInMemory(eventId: string): boolean {
  const entry = getMemoryStore().get(eventId);
  return entry?.status === WEBHOOK_CLAIM_STATUS.processed;
}

export function claimWebhookEventInMemory(
  eventId: string,
  eventType?: string | null,
): WebhookClaimResult {
  const store = getMemoryStore();
  const now = Date.now();
  const leaseMs = getWebhookClaimLeaseMs();
  const existing = store.get(eventId);

  if (!existing) {
    store.set(eventId, {
      status: WEBHOOK_CLAIM_STATUS.processing,
      eventType: eventType ?? null,
      claimedAtMs: now,
      leaseExpiresAtMs: now + leaseMs,
      processedAtMs: null,
    });
    return { ok: true, claimed: true };
  }

  if (existing.status === WEBHOOK_CLAIM_STATUS.processed) {
    return { ok: true, claimed: false, reason: "duplicate" };
  }

  if (existing.leaseExpiresAtMs > now) {
    return { ok: true, claimed: false, reason: "in_progress" };
  }

  // Stale processing → reclaim (single-threaded Map write is atomic in-process).
  existing.status = WEBHOOK_CLAIM_STATUS.processing;
  existing.eventType = eventType ?? existing.eventType;
  existing.claimedAtMs = now;
  existing.leaseExpiresAtMs = now + leaseMs;
  existing.processedAtMs = null;
  return { ok: true, claimed: true };
}

export function releaseWebhookEventClaimInMemory(eventId: string): void {
  const store = getMemoryStore();
  const existing = store.get(eventId);
  if (!existing) return;
  if (existing.status === WEBHOOK_CLAIM_STATUS.processed) return;
  store.delete(eventId);
}

export function markWebhookEventProcessedInMemory(
  eventId: string,
  eventType?: string | null,
): void {
  const store = getMemoryStore();
  const now = Date.now();
  const existing = store.get(eventId);
  store.set(eventId, {
    status: WEBHOOK_CLAIM_STATUS.processed,
    eventType: eventType ?? existing?.eventType ?? null,
    claimedAtMs: existing?.claimedAtMs ?? now,
    leaseExpiresAtMs: existing?.leaseExpiresAtMs ?? now,
    processedAtMs: now,
  });
}

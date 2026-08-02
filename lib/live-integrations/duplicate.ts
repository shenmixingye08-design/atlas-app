/**
 * Duplicate prevention fingerprints — in-memory + optional durable later.
 * Never stores message bodies longer than a hash.
 */

import { createHash } from "crypto";

type DedupeStore = Map<string, number>;

function getStore(): DedupeStore {
  const g = globalThis as typeof globalThis & {
    __atlasLiveIntegrationDedupe?: DedupeStore;
  };
  if (!g.__atlasLiveIntegrationDedupe) {
    g.__atlasLiveIntegrationDedupe = new Map();
  }
  return g.__atlasLiveIntegrationDedupe;
}

export function resetLiveDedupeForTests(): void {
  getStore().clear();
}

export function fingerprintLiveAction(input: {
  userId: string;
  service: string;
  action: string;
  target: string;
  content: string;
}): string {
  const raw = [
    input.userId,
    input.service,
    input.action,
    input.target.trim().toLowerCase(),
    input.content.trim().slice(0, 2000),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

/** Returns true if this action was already performed recently (default 24h). */
export function claimLiveActionOnce(
  fingerprint: string,
  ttlMs = 24 * 60 * 60 * 1000,
): { claimed: boolean; duplicate: boolean } {
  const store = getStore();
  const now = Date.now();
  const prev = store.get(fingerprint);
  if (prev && now - prev < ttlMs) {
    return { claimed: false, duplicate: true };
  }
  store.set(fingerprint, now);
  // opportunistic prune
  if (store.size > 5000) {
    for (const [key, at] of store) {
      if (now - at > ttlMs) store.delete(key);
    }
  }
  return { claimed: true, duplicate: false };
}

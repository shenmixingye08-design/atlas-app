/**
 * HTTP / AI rate limiting entrypoint.
 * P1-06: durable consume goes through distributed DB SoT (`lib/rate-limit`).
 */

import {
  consumeRateLimit,
  resetDistributedRateLimitStoreForTests,
  type RateLimitConsumeResult,
  type RateLimitOptions,
} from "@/lib/rate-limit/db-store";

export type { RateLimitOptions, RateLimitConsumeResult };

/** Costly AI endpoints — per authenticated user (distributed). */
export const AI_API_RATE_LIMIT = {
  bucket: "ai-api",
  max: 60,
  windowMs: 60 * 60 * 1000,
  minIntervalMs: 500,
} as const satisfies RateLimitOptions;

/**
 * Atomic check+record against the distributed SoT.
 * Prefer this over separate check/record to avoid TOCTOU races.
 */
export async function consumeDistributedRateLimit(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitConsumeResult> {
  return consumeRateLimit(key, options);
}

/**
 * Backward-compatible name: performs atomic consume (check+record).
 * Callers that previously checked then recorded should call this once.
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): Promise<{ allowed: boolean; retryAfterMs?: number; remaining?: number }> {
  const result = await consumeRateLimit(key, options);
  return {
    allowed: result.allowed,
    retryAfterMs: result.retryAfterMs,
    remaining: result.remaining,
  };
}

/**
 * No-op under distributed SoT when paired with checkRateLimit/consume
 * (consume already recorded). Kept for call-site compatibility.
 */
export async function recordRateLimitHit(
  key: string,
  options: Pick<RateLimitOptions, "bucket" | "windowMs">,
): Promise<void> {
  void key;
  void options;
  // Atomic consume already recorded the hit.
}

export async function resetRateLimitBucket(bucket: string): Promise<void> {
  void bucket;
  resetDistributedRateLimitStoreForTests();
}

export { resetDistributedRateLimitStoreForTests };

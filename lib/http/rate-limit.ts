type RateLimitOptions = {
  /** Logical bucket name (isolates API families). */
  bucket: string;
  max: number;
  windowMs: number;
  minIntervalMs?: number;
};

type RateLimitBucket = Map<string, number[]>;

function getBucket(name: string): RateLimitBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasHttpRateLimits?: Map<string, RateLimitBucket>;
  };
  if (!scope.__atlasHttpRateLimits) {
    scope.__atlasHttpRateLimits = new Map();
  }
  let bucket = scope.__atlasHttpRateLimits.get(name);
  if (!bucket) {
    bucket = new Map();
    scope.__atlasHttpRateLimits.set(name, bucket);
  }
  return bucket;
}

function pruneTimestamps(
  timestamps: number[],
  now: number,
  windowMs: number,
): number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((value) => value >= cutoff);
}

export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const bucket = getBucket(options.bucket);
  const existing = pruneTimestamps(bucket.get(key) ?? [], now, options.windowMs);

  if (existing.length >= options.max) {
    const oldest = existing[0] ?? now;
    return {
      allowed: false,
      retryAfterMs: Math.max(0, oldest + options.windowMs - now),
    };
  }

  const latest = existing[existing.length - 1];
  if (
    options.minIntervalMs !== undefined &&
    latest !== undefined &&
    now - latest < options.minIntervalMs
  ) {
    return {
      allowed: false,
      retryAfterMs: options.minIntervalMs - (now - latest),
    };
  }

  return { allowed: true };
}

export function recordRateLimitHit(
  key: string,
  options: Pick<RateLimitOptions, "bucket" | "windowMs">,
): void {
  const now = Date.now();
  const bucket = getBucket(options.bucket);
  const existing = pruneTimestamps(bucket.get(key) ?? [], now, options.windowMs);
  existing.push(now);
  bucket.set(key, existing);
}

export function resetRateLimitBucket(bucket: string): void {
  getBucket(bucket).clear();
}

/** Costly AI endpoints — per authenticated user. */
export const AI_API_RATE_LIMIT = {
  bucket: "ai-api",
  max: 60,
  windowMs: 60 * 60 * 1000,
  minIntervalMs: 500,
} as const satisfies RateLimitOptions;

import { contactSpamConfig } from "./spam";

type RateLimitBucket = Map<string, number[]>;

function getBucket(): RateLimitBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasContactRateLimit?: RateLimitBucket;
  };

  if (!globalScope.__atlasContactRateLimit) {
    globalScope.__atlasContactRateLimit = new Map();
  }

  return globalScope.__atlasContactRateLimit;
}

function pruneTimestamps(timestamps: number[], now: number): number[] {
  const oneHourAgo = now - 60 * 60 * 1000;
  return timestamps.filter((value) => value >= oneHourAgo);
}

export function checkContactRateLimit(clientIp: string): {
  allowed: boolean;
  retryAfterMs?: number;
} {
  const now = Date.now();
  const bucket = getBucket();
  const existing = pruneTimestamps(bucket.get(clientIp) ?? [], now);

  if (existing.length >= contactSpamConfig.maxSubmissionsPerHour) {
    const oldest = existing[0] ?? now;
    return {
      allowed: false,
      retryAfterMs: Math.max(0, oldest + 60 * 60 * 1000 - now),
    };
  }

  const latest = existing[existing.length - 1];
  if (
    latest !== undefined &&
    now - latest < contactSpamConfig.minSubmitIntervalMs
  ) {
    return {
      allowed: false,
      retryAfterMs: contactSpamConfig.minSubmitIntervalMs - (now - latest),
    };
  }

  return { allowed: true };
}

export function recordContactSubmission(clientIp: string): void {
  const now = Date.now();
  const bucket = getBucket();
  const existing = pruneTimestamps(bucket.get(clientIp) ?? [], now);
  existing.push(now);
  bucket.set(clientIp, existing);
}

export function resetContactRateLimitStore(): void {
  getBucket().clear();
}

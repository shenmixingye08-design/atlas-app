const buckets = new Map<string, { count: number; resetAt: number }>();

/** Simple in-memory rate limit for push blast APIs (per user). */
export function checkPushRateLimit(
  userId: string,
  maxPerWindow = 5,
  windowMs = 60_000,
): boolean {
  const now = Date.now();
  const bucket = buckets.get(userId);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= maxPerWindow) return false;
  bucket.count += 1;
  return true;
}

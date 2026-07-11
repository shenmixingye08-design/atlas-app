/** Once-per-day dedupe for LINE digest notifications. */
type DigestKey = string;

function getBucket(): Set<DigestKey> {
  const scope = globalThis as typeof globalThis & {
    __atlasLineDigestDedupe?: Set<DigestKey>;
  };
  if (!scope.__atlasLineDigestDedupe) {
    scope.__atlasLineDigestDedupe = new Set();
  }
  return scope.__atlasLineDigestDedupe;
}

function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function claimDailyDigest(
  userId: string,
  kind: "morning_briefing" | "todays_schedule" | "mail_received",
  now = new Date(),
): boolean {
  const key = `${userId}:${kind}:${dayKey(now)}`;
  const bucket = getBucket();
  if (bucket.has(key)) return false;
  bucket.add(key);
  return true;
}

export function resetLineDigestDedupe(): void {
  getBucket().clear();
}

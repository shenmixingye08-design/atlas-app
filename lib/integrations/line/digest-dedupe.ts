/** Once-per-day dedupe for LINE digest notifications. */
import { claimDurableDailyDigest } from "./global-durable";

type DigestKind = "morning_briefing" | "todays_schedule" | "mail_received";

function getMemoryBucket(): Set<string> {
  const scope = globalThis as typeof globalThis & {
    __atlasLineDigestDedupe?: Set<string>;
  };
  if (!scope.__atlasLineDigestDedupe) {
    scope.__atlasLineDigestDedupe = new Set();
  }
  return scope.__atlasLineDigestDedupe;
}

function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function claimDailyDigest(
  userId: string,
  kind: DigestKind,
  now = new Date(),
): Promise<boolean> {
  const day = dayKey(now);
  const memoryKey = `${userId}:${kind}:${day}`;
  const memory = getMemoryBucket();
  if (memory.has(memoryKey)) return false;

  const claimed = await claimDurableDailyDigest(userId, kind, day);
  if (!claimed) return false;

  memory.add(memoryKey);
  return true;
}

export function resetLineDigestDedupe(): void {
  getMemoryBucket().clear();
}

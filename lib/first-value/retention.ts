/**
 * Client-side retention markers for day7 / day30 funnel events.
 * Pure program logic — no AI.
 */

const FIRST_SEEN_KEY = "atlas.first-value.first-seen";
const DAY7_KEY = "atlas.first-value.day7-emitted";
const DAY30_KEY = "atlas.first-value.day30-emitted";

const DAY_MS = 24 * 60 * 60 * 1000;

export type RetentionSnapshot = {
  firstSeenAt: string;
  daysSinceFirstSeen: number;
  emitDay7: boolean;
  emitDay30: boolean;
};

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

export function ensureFirstSeenAt(now = new Date()): string {
  if (typeof window === "undefined") return now.toISOString();
  try {
    const existing = window.localStorage.getItem(FIRST_SEEN_KEY);
    if (existing) return existing;
    const iso = now.toISOString();
    window.localStorage.setItem(FIRST_SEEN_KEY, iso);
    return iso;
  } catch {
    return now.toISOString();
  }
}

export function evaluateRetention(now = new Date()): RetentionSnapshot {
  const firstSeenAt = ensureFirstSeenAt(now);
  const firstMs = Date.parse(firstSeenAt);
  const daysSinceFirstSeen = Number.isFinite(firstMs)
    ? Math.floor((now.getTime() - firstMs) / DAY_MS)
    : 0;

  const emitDay7 =
    daysSinceFirstSeen >= 7 && !readFlag(DAY7_KEY);
  const emitDay30 =
    daysSinceFirstSeen >= 30 && !readFlag(DAY30_KEY);

  return {
    firstSeenAt,
    daysSinceFirstSeen,
    emitDay7,
    emitDay30,
  };
}

export function markRetentionEmitted(kind: "day7" | "day30"): void {
  writeFlag(kind === "day7" ? DAY7_KEY : DAY30_KEY);
}

export function resetRetentionForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(FIRST_SEEN_KEY);
    window.localStorage.removeItem(DAY7_KEY);
    window.localStorage.removeItem(DAY30_KEY);
  } catch {
    // ignore
  }
}

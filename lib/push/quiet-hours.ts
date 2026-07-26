import type { PushPreferences, PushSeverity } from "./types";

const TOKYO_TZ = "Asia/Tokyo";

/** Minutes from midnight in Asia/Tokyo for the given instant. */
export function tokyoMinutesOfDay(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TOKYO_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "NaN");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "NaN");
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
  // en-GB can yield "24" for midnight in some engines — normalize.
  return ((hour % 24) * 60) + minute;
}

function parseHm(value: string): number | null {
  const [hRaw, mRaw] = value.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Quiet hours in JST. Supports overnight ranges (e.g. 22:00–07:00).
 * Empty / invalid bounds → not in quiet hours.
 */
export function isInQuietHours(
  prefs: Pick<PushPreferences, "quietHoursStart" | "quietHoursEnd">,
  now: Date = new Date(),
): boolean {
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;

  const start = parseHm(prefs.quietHoursStart);
  const end = parseHm(prefs.quietHoursEnd);
  if (start === null || end === null) return false;
  if (start === end) return false;

  const minutes = tokyoMinutesOfDay(now);

  if (start < end) {
    return minutes >= start && minutes < end;
  }
  // Overnight: e.g. 22:00 → 07:00
  return minutes >= start || minutes < end;
}

/**
 * Whether delivery should be suppressed by quiet hours.
 * Critical (緊急) always bypasses quiet hours.
 */
export function isSuppressedByQuietHours(input: {
  prefs: Pick<PushPreferences, "quietHoursStart" | "quietHoursEnd">;
  severity: PushSeverity;
  now?: Date;
}): boolean {
  if (input.severity === "critical") return false;
  return isInQuietHours(input.prefs, input.now);
}

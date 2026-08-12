/**
 * Single-conversion display helpers for user-facing times.
 *
 * DB/Scheduler store UTC instants (ISO). UI must format once into the user
 * timezone (default Asia/Tokyo). Never format with the server host TZ.
 *
 * Production evidence (≈2026-08-13 01:35 JST): 「今日の仕事」 showed 16:00
 * because ops summary used toLocaleTimeString without timeZone on a UTC host.
 */

import {
  DEFAULT_AUTOMATION_TIMEZONE,
  getZonedParts,
} from "@/lib/automations/schedule";

export { DEFAULT_AUTOMATION_TIMEZONE as DEFAULT_USER_DISPLAY_TIMEZONE };

/** Offset in ms between UTC and the given timezone at `date`. */
function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0,
    0,
  );
  return asUtc - date.getTime();
}

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const offset = getTimeZoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

function addDays(year: number, month: number, day: number, amount: number) {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/** Start of calendar day in `timeZone` as a UTC Date (inclusive bound). */
export function startOfDayInTimeZone(
  now: Date,
  timeZone: string = DEFAULT_AUTOMATION_TIMEZONE,
): Date {
  const parts = getZonedParts(now, timeZone);
  return zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, timeZone);
}

/** Exclusive end of calendar day in `timeZone` as a UTC Date. */
export function endOfDayInTimeZone(
  now: Date,
  timeZone: string = DEFAULT_AUTOMATION_TIMEZONE,
): Date {
  const parts = getZonedParts(now, timeZone);
  const next = addDays(parts.year, parts.month, parts.day, 1);
  return zonedTimeToUtc(next.year, next.month, next.day, 0, 0, timeZone);
}

export function isInstantInZonedDay(
  isoOrDate: string | Date,
  now: Date,
  timeZone: string = DEFAULT_AUTOMATION_TIMEZONE,
): boolean {
  const t =
    typeof isoOrDate === "string" ? Date.parse(isoOrDate) : isoOrDate.getTime();
  if (!Number.isFinite(t)) return false;
  return t >= startOfDayInTimeZone(now, timeZone).getTime() &&
    t < endOfDayInTimeZone(now, timeZone).getTime();
}

/** HH:mm in user timezone (single conversion from UTC ISO). */
export function formatTimeInUserTimeZone(
  iso: string | null | undefined,
  options?: {
    timeZone?: string;
    fallback?: string;
  },
): string {
  const fallback = options?.fallback ?? "--:--";
  if (!iso) return fallback;
  // Already a wall-clock label like "09:00" from schedule presets — keep as-is.
  if (/^\d{1,2}:\d{2}$/.test(iso.trim())) return iso.trim().padStart(5, "0");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: options?.timeZone ?? DEFAULT_AUTOMATION_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Date + time in user timezone (single conversion). */
export function formatDateTimeInUserTimeZone(
  iso: string | null | undefined,
  options?: {
    timeZone?: string;
    fallback?: string;
    dateStyle?: "short" | "medium" | "long";
  },
): string {
  const fallback = options?.fallback ?? "—";
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const timeZone = options?.timeZone ?? DEFAULT_AUTOMATION_TIMEZONE;
  if (options?.dateStyle === "long") {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone,
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  }
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    month: "short",
    day: "numeric",
    weekday: options?.dateStyle === "medium" ? "short" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatCalendarDateInUserTimeZone(
  now: Date = new Date(),
  timeZone: string = DEFAULT_AUTOMATION_TIMEZONE,
): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(now);
}

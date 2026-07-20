/**
 * Pure scheduling logic for X auto-post. NO AI, NO I/O — normal code only.
 * All wall-clock times are interpreted in the user's timezone (default JST).
 *
 * A "slot" is one scheduled posting time on a given day. Its slotKey
 * ("YYYY-MM-DDTHH:mm") is used as the idempotency key so a slot is posted at
 * most once regardless of how often the cron fires.
 */

import type { XAutoPostSettings } from "./autopost-types";

export type XAutoPostSlot = {
  slotKey: string;
  scheduledFor: string; // ISO (UTC instant)
  timeLabel: string; // "HH:mm"
};

/** Default catch-up window: how late a slot may still be posted. */
export const DEFAULT_CATCHUP_MINUTES = 120;

function resolveCatchupMinutes(): number {
  const raw = Number(process.env.X_AUTOPOST_CATCHUP_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CATCHUP_MINUTES;
}

type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  weekday: number; // 0 (Sun) - 6 (Sat)
  dateKey: string; // "YYYY-MM-DD"
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Break an instant into wall-clock parts for a timezone. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const lookup = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = Number(lookup("year"));
  const month = Number(lookup("month"));
  const day = Number(lookup("day"));
  let hour = Number(lookup("hour"));
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  const minute = Number(lookup("minute"));
  const weekday = WEEKDAY_INDEX[lookup("weekday")] ?? 0;
  const dateKey = `${lookup("year")}-${lookup("month")}-${lookup("day")}`;

  return { year, month, day, hour, minute, weekday, dateKey };
}

/** Offset (ms) of timeZone relative to UTC at the given instant. */
function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = getZonedParts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0,
  );
  return asUtc - utcMs;
}

/** Convert a wall-clock time (dateKey + HH:mm) in timeZone to a UTC instant. */
export function zonedWallTimeToDate(
  dateKey: string,
  time: string,
  timeZone: string,
): Date | null {
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!timeMatch) return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!dateMatch) return null;

  const naiveUtc = Date.parse(`${dateKey}T${time}:00Z`);
  if (Number.isNaN(naiveUtc)) return null;

  // Adjust by the zone offset at that approximate instant. Two passes converge
  // for zones without sub-hour DST edge cases (JST has none).
  const offset1 = timeZoneOffsetMs(naiveUtc, timeZone);
  const candidate = naiveUtc - offset1;
  const offset2 = timeZoneOffsetMs(candidate, timeZone);
  return new Date(naiveUtc - offset2);
}

function isActiveWeekday(settings: XAutoPostSettings, weekday: number): boolean {
  if (settings.frequency.startsWith("daily")) return true;
  return settings.daysOfWeek.includes(weekday);
}

function dateKeyForOffsetDays(
  now: Date,
  timeZone: string,
  offsetDays: number,
): { dateKey: string; weekday: number } {
  const shifted = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = getZonedParts(shifted, timeZone);
  return { dateKey: parts.dateKey, weekday: parts.weekday };
}

/**
 * Slots that are due to be posted "now" (scheduled time already passed and still
 * within the catch-up window). Evaluates today + yesterday to cover slots that
 * cross midnight before the next cron tick.
 */
export function computeDueSlots(
  settings: XAutoPostSettings,
  now: Date = new Date(),
  catchupMinutes: number = resolveCatchupMinutes(),
): XAutoPostSlot[] {
  if (!settings.enabled) return [];
  if (settings.postTimes.length === 0) return [];

  const timeZone = settings.timezone || "Asia/Tokyo";
  const nowMs = now.getTime();
  const catchupMs = catchupMinutes * 60 * 1000;

  const candidateDays = [
    dateKeyForOffsetDays(now, timeZone, -1),
    dateKeyForOffsetDays(now, timeZone, 0),
  ];

  const slots: XAutoPostSlot[] = [];
  const seen = new Set<string>();

  for (const { dateKey, weekday } of candidateDays) {
    if (!isActiveWeekday(settings, weekday)) continue;

    for (const time of settings.postTimes) {
      const scheduled = zonedWallTimeToDate(dateKey, time, timeZone);
      if (!scheduled) continue;

      const scheduledMs = scheduled.getTime();
      const isDue = scheduledMs <= nowMs && nowMs - scheduledMs <= catchupMs;
      if (!isDue) continue;

      const slotKey = `${dateKey}T${time}`;
      if (seen.has(slotKey)) continue;
      seen.add(slotKey);

      slots.push({
        slotKey,
        scheduledFor: scheduled.toISOString(),
        timeLabel: time,
      });
    }
  }

  return slots.sort(
    (a, b) =>
      new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
  );
}

/** The next upcoming scheduled time (ISO) or null if none within 8 days. */
export function computeNextScheduledFor(
  settings: XAutoPostSettings,
  now: Date = new Date(),
): string | null {
  if (!settings.enabled) return null;
  if (settings.postTimes.length === 0) return null;

  const timeZone = settings.timezone || "Asia/Tokyo";
  const nowMs = now.getTime();

  for (let offset = 0; offset <= 8; offset += 1) {
    const { dateKey, weekday } = dateKeyForOffsetDays(now, timeZone, offset);
    if (!isActiveWeekday(settings, weekday)) continue;

    const upcoming = settings.postTimes
      .map((time) => zonedWallTimeToDate(dateKey, time, timeZone))
      .filter((date): date is Date => date !== null)
      .filter((date) => date.getTime() > nowMs)
      .sort((a, b) => a.getTime() - b.getTime());

    if (upcoming.length > 0) {
      return upcoming[0]!.toISOString();
    }
  }

  return null;
}

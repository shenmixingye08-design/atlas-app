/**
 * Pure date distribution for X batch posts. No AI, no I/O.
 * Wall-clock times are interpreted in the user's timezone.
 */

import {
  getZonedParts,
  zonedWallTimeToDate,
} from "./autopost-schedule";
import { X_POST_BATCH_DEFAULT_TIMEZONE } from "./batch-config";

export type BatchScheduleSlot = {
  dateKey: string;
  weekday: number;
  timeLabel: string;
  scheduledFor: string;
};

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_LABEL = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function resolveBatchTimezone(timezone: string | null | undefined): string {
  const trimmed = timezone?.trim();
  if (!trimmed) return X_POST_BATCH_DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return X_POST_BATCH_DEFAULT_TIMEZONE;
  }
}

export function normalizeBatchWeekdays(daysOfWeek: unknown): number[] {
  if (!Array.isArray(daysOfWeek)) return [];
  const unique = new Set<number>();
  for (const value of daysOfWeek) {
    const day = typeof value === "number" ? value : Number(value);
    if (Number.isInteger(day) && day >= 0 && day <= 6) unique.add(day);
  }
  return [...unique].sort((a, b) => a - b);
}

export function parseBatchDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return value;
}

export function parseBatchPostTime(value: unknown): string | null {
  return typeof value === "string" && TIME_LABEL.test(value) ? value : null;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const match = DATE_KEY.exec(dateKey);
  if (!match) return dateKey;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const next = new Date(utc + days * 24 * 60 * 60 * 1000);
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const day = String(next.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekdayForDateKey(dateKey: string, timeZone: string): number {
  const instant = zonedWallTimeToDate(dateKey, "12:00", timeZone);
  if (!instant) {
    const utc = new Date(`${dateKey}T00:00:00Z`);
    return utc.getUTCDay();
  }
  return getZonedParts(instant, timeZone).weekday;
}

/**
 * Enumerate unique wall-clock slots between start and end (inclusive)
 * that fall on selected weekdays.
 */
export function enumerateBatchSlots(input: {
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
  postTime: string;
  timezone: string;
  count: number;
  occupiedUtc?: ReadonlySet<string>;
}): BatchScheduleSlot[] {
  const timeZone = resolveBatchTimezone(input.timezone);
  const start = parseBatchDateKey(input.startDate);
  const end = parseBatchDateKey(input.endDate);
  const postTime = parseBatchPostTime(input.postTime);
  const days = normalizeBatchWeekdays(input.daysOfWeek);
  if (!start || !end || !postTime || input.count < 1) return [];
  if (start > end) return [];

  const weekdays = days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
  const slots: BatchScheduleSlot[] = [];
  let cursor = start;
  let guard = 0;

  while (cursor <= end && slots.length < input.count && guard < 800) {
    guard += 1;
    const weekday = weekdayForDateKey(cursor, timeZone);
    if (weekdays.includes(weekday)) {
      const instant = zonedWallTimeToDate(cursor, postTime, timeZone);
      if (instant) {
        const scheduledFor = instant.toISOString();
        if (!input.occupiedUtc?.has(scheduledFor)) {
          slots.push({
            dateKey: cursor,
            weekday,
            timeLabel: postTime,
            scheduledFor,
          });
        }
      }
    }
    cursor = addDaysToDateKey(cursor, 1);
  }

  return slots;
}

/**
 * Assign unique UTC instants to N items. If the date window is too small,
 * continue past endDate on matching weekdays so every item gets a slot.
 */
export function distributeBatchSchedule(input: {
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
  postTime: string;
  timezone: string;
  count: number;
  occupiedUtc?: ReadonlySet<string>;
}): BatchScheduleSlot[] {
  const first = enumerateBatchSlots(input);
  if (first.length >= input.count) return first.slice(0, input.count);

  const timeZone = resolveBatchTimezone(input.timezone);
  const start = parseBatchDateKey(input.startDate);
  const postTime = parseBatchPostTime(input.postTime);
  if (!start || !postTime) return first;

  const weekdays =
    normalizeBatchWeekdays(input.daysOfWeek).length > 0
      ? normalizeBatchWeekdays(input.daysOfWeek)
      : [0, 1, 2, 3, 4, 5, 6];
  const used = new Set(first.map((slot) => slot.scheduledFor));
  for (const occupied of input.occupiedUtc ?? []) used.add(occupied);

  const extra: BatchScheduleSlot[] = [...first];
  let cursor = addDaysToDateKey(start, 0);
  let guard = 0;
  while (extra.length < input.count && guard < 800) {
    guard += 1;
    const weekday = weekdayForDateKey(cursor, timeZone);
    if (weekdays.includes(weekday)) {
      const instant = zonedWallTimeToDate(cursor, postTime, timeZone);
      if (instant) {
        const scheduledFor = instant.toISOString();
        if (!used.has(scheduledFor)) {
          used.add(scheduledFor);
          extra.push({
            dateKey: cursor,
            weekday,
            timeLabel: postTime,
            scheduledFor,
          });
        }
      }
    }
    cursor = addDaysToDateKey(cursor, 1);
  }
  return extra.slice(0, input.count);
}

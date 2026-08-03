/**
 * Safe RRULE generation for Google Calendar.
 */

import type { CalendarRecurrenceInput } from "./types";

const WEEKDAYS = new Set(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);

export function resolveCalendarRecurrence(
  value: unknown,
): CalendarRecurrenceInput | null {
  if (value == null || value === false || value === "") return null;
  if (typeof value === "string") {
    const freq = value.toLowerCase();
    if (freq === "daily" || freq === "weekly" || freq === "monthly") {
      return {
        frequency: freq,
        interval: 1,
        count: null,
        until: null,
        byWeekDay: [],
      };
    }
    throw new Error(`calendar invalid recurrence: ${value}`);
  }
  if (typeof value !== "object") {
    throw new Error("calendar invalid recurrence");
  }
  const row = value as Record<string, unknown>;
  const frequency = String(row.frequency ?? row.freq ?? "")
    .toLowerCase()
    .trim();
  if (
    frequency !== "daily" &&
    frequency !== "weekly" &&
    frequency !== "monthly"
  ) {
    throw new Error("calendar invalid recurrence: frequency");
  }
  const interval =
    typeof row.interval === "number" && row.interval >= 1
      ? Math.floor(row.interval)
      : 1;
  if (interval > 30) {
    throw new Error("calendar invalid recurrence: interval too large");
  }
  const count =
    typeof row.count === "number" && row.count >= 1
      ? Math.min(Math.floor(row.count), 365)
      : null;
  const until =
    typeof row.until === "string" && row.until.trim()
      ? row.until.trim()
      : null;
  if (count && until) {
    throw new Error("calendar invalid recurrence: count and until are mutually exclusive");
  }
  const byWeekDayRaw = Array.isArray(row.byWeekDay)
    ? row.byWeekDay
    : Array.isArray(row.byday)
      ? row.byday
      : [];
  const byWeekDay = byWeekDayRaw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => WEEKDAYS.has(item));

  return {
    frequency,
    interval,
    count,
    until,
    byWeekDay,
  };
}

export function buildRrule(recurrence: CalendarRecurrenceInput): string {
  const parts = [
    `FREQ=${recurrence.frequency.toUpperCase()}`,
    `INTERVAL=${recurrence.interval}`,
  ];
  if (recurrence.byWeekDay.length > 0) {
    parts.push(`BYDAY=${recurrence.byWeekDay.join(",")}`);
  }
  if (recurrence.count) {
    parts.push(`COUNT=${recurrence.count}`);
  }
  if (recurrence.until) {
    const untilMs = Date.parse(recurrence.until);
    if (!Number.isFinite(untilMs)) {
      throw new Error("calendar invalid recurrence: until");
    }
    const until = new Date(untilMs)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    parts.push(`UNTIL=${until}`);
  }
  return `RRULE:${parts.join(";")}`;
}

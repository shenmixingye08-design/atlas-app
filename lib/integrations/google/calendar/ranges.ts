import { getZonedParts } from "@/lib/automations/schedule";

import type { CalendarRangeId, CalendarRangeWindow } from "./types";

export const CALENDAR_TIMEZONE = "Asia/Tokyo";

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(guess);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  const asUtc = Date.UTC(
    Number.parseInt(lookup("year"), 10),
    Number.parseInt(lookup("month"), 10) - 1,
    Number.parseInt(lookup("day"), 10),
    Number.parseInt(lookup("hour"), 10),
    Number.parseInt(lookup("minute"), 10),
    0,
    0,
  );
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

function startOfDay(date: Date, timeZone: string): Date {
  const parts = getZonedParts(date, timeZone);
  return zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, timeZone);
}

function addDays(year: number, month: number, day: number, amount: number) {
  const base = new Date(Date.UTC(year, month - 1, day + amount, 12, 0, 0, 0));
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

function mondayOfWeekContaining(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const daysFromMonday = (parts.dayOfWeek + 6) % 7;
  return addDays(parts.year, parts.month, parts.day, -daysFromMonday);
}

const RANGE_LABELS: Record<CalendarRangeId, string> = {
  today: "今日",
  this_week: "今週",
  next_week: "来週",
};

export function isCalendarRangeId(value: string): value is CalendarRangeId {
  return value === "today" || value === "this_week" || value === "next_week";
}

export function resolveCalendarRangeWindow(
  range: CalendarRangeId,
  now: Date = new Date(),
  timeZone: string = CALENDAR_TIMEZONE,
): CalendarRangeWindow {
  if (range === "today") {
    const start = startOfDay(now, timeZone);
    const parts = getZonedParts(now, timeZone);
    const nextDay = addDays(parts.year, parts.month, parts.day, 1);
    const end = zonedTimeToUtc(
      nextDay.year,
      nextDay.month,
      nextDay.day,
      0,
      0,
      timeZone,
    );

    return {
      range,
      label: RANGE_LABELS[range],
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
    };
  }

  const monday =
    range === "this_week"
      ? mondayOfWeekContaining(now, timeZone)
      : (() => {
          const currentMonday = mondayOfWeekContaining(now, timeZone);
          return addDays(currentMonday.year, currentMonday.month, currentMonday.day, 7);
        })();

  const weekEnd = addDays(monday.year, monday.month, monday.day, 7);
  const timeMin = zonedTimeToUtc(
    monday.year,
    monday.month,
    monday.day,
    0,
    0,
    timeZone,
  ).toISOString();
  const timeMax = zonedTimeToUtc(
    weekEnd.year,
    weekEnd.month,
    weekEnd.day,
    0,
    0,
    timeZone,
  ).toISOString();

  return {
    range,
    label: RANGE_LABELS[range],
    timeMin,
    timeMax,
  };
}

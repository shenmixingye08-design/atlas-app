export const DEFAULT_AUTOMATION_PLATFORM_TIMEZONE = "Asia/Tokyo";

const TIMEZONE_PATTERN = /^[A-Za-z0-9_+\-/]+$/;

/** Validate IANA timezone via Intl — rejects unknown zones. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || !TIMEZONE_PATTERN.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(
  timeZone: string | null | undefined,
  fallback: string = DEFAULT_AUTOMATION_PLATFORM_TIMEZONE,
): string {
  if (timeZone && isValidTimeZone(timeZone)) return timeZone;
  if (isValidTimeZone(fallback)) return fallback;
  return "UTC";
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number;
};

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // Intl may emit hour "24" for midnight in some environments
  let hour = Number.parseInt(lookup("hour"), 10);
  if (hour === 24) hour = 0;

  return {
    year: Number.parseInt(lookup("year"), 10),
    month: Number.parseInt(lookup("month"), 10),
    day: Number.parseInt(lookup("day"), 10),
    hour,
    minute: Number.parseInt(lookup("minute"), 10),
    second: Number.parseInt(lookup("second"), 10),
    dayOfWeek: weekdayMap[lookup("weekday")] ?? 0,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    0,
  );
  return asUtc - date.getTime();
}

/**
 * Convert wall-clock time in `timeZone` to a UTC Date.
 * Recomputes offset once to reduce DST ambiguity errors.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const offset1 = getTimeZoneOffsetMs(guess, timeZone);
  const corrected = new Date(guess.getTime() - offset1);
  const offset2 = getTimeZoneOffsetMs(corrected, timeZone);
  if (offset1 !== offset2) {
    return new Date(guess.getTime() - offset2);
  }
  return corrected;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addCalendarDays(
  year: number,
  month: number,
  day: number,
  amount: number,
): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function clampDayOfMonth(
  year: number,
  month: number,
  dayOfMonth: number,
): number {
  return Math.min(Math.max(1, dayOfMonth), daysInMonth(year, month));
}

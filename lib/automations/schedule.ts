import type { AutomationSchedule, SchedulePreset, Timestamp } from "./types";

export const DEFAULT_AUTOMATION_TIMEZONE = "Asia/Tokyo";

/** Map presets to cron strings for future external schedulers. */
export function presetToCron(preset: SchedulePreset): string {
  switch (preset.type) {
    case "daily":
      return `${preset.minute} ${preset.hour} * * *`;
    case "weekly":
      return `${preset.minute} ${preset.hour} * * ${preset.dayOfWeek}`;
    case "monthly":
      return `${preset.minute} ${preset.hour} ${preset.dayOfMonth} * *`;
  }
}

/** Parts of a date in a specific IANA timezone. */
export function getZonedParts(date: Date, timeZone: string) {
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

  return {
    year: Number.parseInt(lookup("year"), 10),
    month: Number.parseInt(lookup("month"), 10),
    day: Number.parseInt(lookup("day"), 10),
    hour: Number.parseInt(lookup("hour"), 10),
    minute: Number.parseInt(lookup("minute"), 10),
    dayOfWeek: weekdayMap[lookup("weekday")] ?? 0,
  };
}

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

function computeNextFromPreset(
  preset: SchedulePreset,
  timeZone: string,
  from: Date,
): Date {
  const now = getZonedParts(from, timeZone);

  switch (preset.type) {
    case "daily": {
      let candidate = zonedTimeToUtc(
        now.year,
        now.month,
        now.day,
        preset.hour,
        preset.minute,
        timeZone,
      );

      if (candidate.getTime() <= from.getTime()) {
        const nextDay = addDays(now.year, now.month, now.day, 1);
        candidate = zonedTimeToUtc(
          nextDay.year,
          nextDay.month,
          nextDay.day,
          preset.hour,
          preset.minute,
          timeZone,
        );
      }

      return candidate;
    }

    case "weekly": {
      let daysUntil = (preset.dayOfWeek - now.dayOfWeek + 7) % 7;
      let target = addDays(now.year, now.month, now.day, daysUntil);
      let candidate = zonedTimeToUtc(
        target.year,
        target.month,
        target.day,
        preset.hour,
        preset.minute,
        timeZone,
      );

      if (candidate.getTime() <= from.getTime()) {
        target = addDays(target.year, target.month, target.day, 7);
        candidate = zonedTimeToUtc(
          target.year,
          target.month,
          target.day,
          preset.hour,
          preset.minute,
          timeZone,
        );
      }

      return candidate;
    }

    case "monthly": {
      const clampDay = (year: number, month: number) => {
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return Math.min(preset.dayOfMonth, lastDay);
      };

      let day = clampDay(now.year, now.month);
      let candidate = zonedTimeToUtc(
        now.year,
        now.month,
        day,
        preset.hour,
        preset.minute,
        timeZone,
      );

      if (candidate.getTime() <= from.getTime()) {
        let month = now.month + 1;
        let year = now.year;
        if (month > 12) {
          month = 1;
          year += 1;
        }
        day = clampDay(year, month);
        candidate = zonedTimeToUtc(
          year,
          month,
          day,
          preset.hour,
          preset.minute,
          timeZone,
        );
      }

      return candidate;
    }
  }
}

export function isSameCalendarDayInZone(
  left: Date,
  right: Date,
  timeZone: string,
): boolean {
  const a = getZonedParts(left, timeZone);
  const b = getZonedParts(right, timeZone);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Compute the next scheduled run time. Returns null for non-schedule triggers. */
export function computeNextRun(
  schedule: AutomationSchedule,
  from: Date = new Date(),
): Date | null {
  if (schedule.kind !== "schedule") return null;

  return computeNextFromPreset(
    schedule.preset,
    schedule.timezone || DEFAULT_AUTOMATION_TIMEZONE,
    from,
  );
}

export function computeNextRunIso(
  schedule: AutomationSchedule,
  from: Date = new Date(),
): Timestamp | null {
  const next = computeNextRun(schedule, from);
  return next ? next.toISOString() : null;
}

export function isAutomationDue(
  automation: {
    enabled: boolean;
    nextRun: Timestamp | null;
    timing?: import("./types").AutomationTiming;
  },
  now: Date = new Date(),
): boolean {
  if (!automation.enabled || !automation.nextRun) return false;

  const timing = automation.timing;
  if (timing?.startDate && new Date(timing.startDate).getTime() > now.getTime()) {
    return false;
  }

  const end = timing?.endCondition;
  if (end?.type === "until_date" && new Date(end.until).getTime() < now.getTime()) {
    return false;
  }
  if (
    end?.type === "occurrence_count" &&
    end.completedOccurrences >= end.maxOccurrences
  ) {
    return false;
  }

  return new Date(automation.nextRun).getTime() <= now.getTime();
}

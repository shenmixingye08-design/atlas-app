import { calculateNextRunAtFromV1Schedule } from "@/lib/scheduler-core/calculate-next-run-at";

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

export function isSameCalendarDayInZone(
  left: Date,
  right: Date,
  timeZone: string,
): boolean {
  const a = getZonedParts(left, timeZone);
  const b = getZonedParts(right, timeZone);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * Compute the next scheduled run time. Returns null for non-schedule triggers.
 * Phase 2-2: delegates to scheduler-core calculateNextRunAt (server-side SoT).
 */
export function computeNextRun(
  schedule: AutomationSchedule,
  from: Date = new Date(),
): Date | null {
  if (schedule.kind !== "schedule") return null;
  return calculateNextRunAtFromV1Schedule(schedule, from);
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

import type {
  AutomationScheduleSpec,
  AutomationTrigger,
  ScheduleFrequency,
} from "@/lib/automation-platform/types";
import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";

import {
  addCalendarDays,
  clampDayOfMonth,
  DEFAULT_AUTOMATION_PLATFORM_TIMEZONE,
  getZonedParts,
  isValidTimeZone,
  resolveTimeZone,
  zonedTimeToUtc,
} from "./timezone";

function assertHourMinute(hour: number, minute: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new AutomationPlatformError("automation_invalid_schedule", {
      field: "hour",
      value: hour,
    });
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new AutomationPlatformError("automation_invalid_schedule", {
      field: "minute",
      value: minute,
    });
  }
}

export function validateScheduleSpec(
  schedule: AutomationScheduleSpec,
  timezone: string,
): void {
  if (!isValidTimeZone(timezone)) {
    throw new AutomationPlatformError("automation_invalid_schedule", {
      field: "timezone",
      value: timezone,
    });
  }

  const frequencies: ScheduleFrequency[] = [
    "once",
    "daily",
    "weekly",
    "monthly",
    "weekdays",
    "month_end",
    "custom_days",
  ];
  if (!frequencies.includes(schedule.frequency)) {
    throw new AutomationPlatformError("automation_invalid_schedule", {
      field: "frequency",
      value: schedule.frequency,
    });
  }

  if (schedule.frequency === "once") {
    if (!schedule.runAt || Number.isNaN(Date.parse(schedule.runAt))) {
      throw new AutomationPlatformError("automation_invalid_schedule", {
        field: "runAt",
        value: schedule.runAt,
      });
    }
    return;
  }

  assertHourMinute(schedule.hour, schedule.minute);

  if (
    (schedule.frequency === "weekly" || schedule.frequency === "custom_days") &&
    (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0)
  ) {
    throw new AutomationPlatformError("automation_invalid_schedule", {
      field: "daysOfWeek",
    });
  }

  if (schedule.daysOfWeek) {
    for (const day of schedule.daysOfWeek) {
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        throw new AutomationPlatformError("automation_invalid_schedule", {
          field: "daysOfWeek",
          value: day,
        });
      }
    }
  }

  if (
    schedule.frequency === "monthly" &&
    (schedule.dayOfMonth === undefined ||
      !Number.isInteger(schedule.dayOfMonth) ||
      schedule.dayOfMonth < 1 ||
      schedule.dayOfMonth > 31)
  ) {
    throw new AutomationPlatformError("automation_invalid_schedule", {
      field: "dayOfMonth",
      value: schedule.dayOfMonth,
    });
  }
}

function candidateAt(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  return zonedTimeToUtc(year, month, day, hour, minute, timeZone);
}

function nextWeekdayMatch(
  fromParts: ReturnType<typeof getZonedParts>,
  allowedDays: number[],
  hour: number,
  minute: number,
  timeZone: string,
  from: Date,
): Date {
  const unique = [...new Set(allowedDays)].sort((a, b) => a - b);
  for (let offset = 0; offset <= 14; offset += 1) {
    const target = addCalendarDays(
      fromParts.year,
      fromParts.month,
      fromParts.day,
      offset,
    );
    const probe = candidateAt(
      target.year,
      target.month,
      target.day,
      hour,
      minute,
      timeZone,
    );
    const probeParts = getZonedParts(probe, timeZone);
    if (
      unique.includes(probeParts.dayOfWeek) &&
      probe.getTime() > from.getTime()
    ) {
      return probe;
    }
  }
  throw new AutomationPlatformError("automation_invalid_schedule", {
    reason: "unable_to_compute_weekday",
  });
}

/**
 * Compute the next run strictly in the future relative to `from`.
 * Does not catch up on missed past occurrences (no infinite backlog).
 */
export function computeNextRunFromSchedule(
  schedule: AutomationScheduleSpec,
  timezone: string,
  from: Date = new Date(),
): Date | null {
  const timeZone = resolveTimeZone(
    timezone,
    DEFAULT_AUTOMATION_PLATFORM_TIMEZONE,
  );
  validateScheduleSpec(schedule, timeZone);

  if (schedule.startAt && Date.parse(schedule.startAt) > from.getTime()) {
    // Jump computation base to startAt when start is in the future
    return computeNextRunFromSchedule(
      { ...schedule, startAt: null },
      timeZone,
      new Date(schedule.startAt),
    );
  }

  if (schedule.endAt && Date.parse(schedule.endAt) <= from.getTime()) {
    return null;
  }

  if (schedule.frequency === "once") {
    const runAt = new Date(schedule.runAt!);
    if (runAt.getTime() <= from.getTime()) return null;
    if (schedule.endAt && runAt.getTime() >= Date.parse(schedule.endAt)) {
      return null;
    }
    return runAt;
  }

  const parts = getZonedParts(from, timeZone);
  let next: Date;

  switch (schedule.frequency) {
    case "daily": {
      next = candidateAt(
        parts.year,
        parts.month,
        parts.day,
        schedule.hour,
        schedule.minute,
        timeZone,
      );
      if (next.getTime() <= from.getTime()) {
        const d = addCalendarDays(parts.year, parts.month, parts.day, 1);
        next = candidateAt(
          d.year,
          d.month,
          d.day,
          schedule.hour,
          schedule.minute,
          timeZone,
        );
      }
      break;
    }
    case "weekdays": {
      next = nextWeekdayMatch(
        parts,
        [1, 2, 3, 4, 5],
        schedule.hour,
        schedule.minute,
        timeZone,
        from,
      );
      break;
    }
    case "weekly":
    case "custom_days": {
      next = nextWeekdayMatch(
        parts,
        schedule.daysOfWeek ?? [],
        schedule.hour,
        schedule.minute,
        timeZone,
        from,
      );
      break;
    }
    case "monthly": {
      const day = clampDayOfMonth(
        parts.year,
        parts.month,
        schedule.dayOfMonth ?? 1,
      );
      next = candidateAt(
        parts.year,
        parts.month,
        day,
        schedule.hour,
        schedule.minute,
        timeZone,
      );
      if (next.getTime() <= from.getTime()) {
        let month = parts.month + 1;
        let year = parts.year;
        if (month > 12) {
          month = 1;
          year += 1;
        }
        const nextDay = clampDayOfMonth(year, month, schedule.dayOfMonth ?? 1);
        next = candidateAt(
          year,
          month,
          nextDay,
          schedule.hour,
          schedule.minute,
          timeZone,
        );
      }
      break;
    }
    case "month_end": {
      const last = clampDayOfMonth(parts.year, parts.month, 31);
      next = candidateAt(
        parts.year,
        parts.month,
        last,
        schedule.hour,
        schedule.minute,
        timeZone,
      );
      if (next.getTime() <= from.getTime()) {
        let month = parts.month + 1;
        let year = parts.year;
        if (month > 12) {
          month = 1;
          year += 1;
        }
        const nextLast = clampDayOfMonth(year, month, 31);
        next = candidateAt(
          year,
          month,
          nextLast,
          schedule.hour,
          schedule.minute,
          timeZone,
        );
      }
      break;
    }
    default:
      throw new AutomationPlatformError("automation_invalid_schedule", {
        field: "frequency",
        value: schedule.frequency,
      });
  }

  if (schedule.endAt && next.getTime() >= Date.parse(schedule.endAt)) {
    return null;
  }

  return next;
}

export function computeNextRunIsoFromTrigger(
  trigger: AutomationTrigger,
  from: Date = new Date(),
): string | null {
  if (trigger.type === "manual") return null;
  if (trigger.type !== "schedule" || !trigger.schedule) return null;
  const next = computeNextRunFromSchedule(
    trigger.schedule,
    trigger.timezone,
    from,
  );
  return next ? next.toISOString() : null;
}

/**
 * Reject creating a one-shot schedule already in the past.
 */
export function assertNotPastOneShot(
  schedule: AutomationScheduleSpec,
  now: Date = new Date(),
): void {
  if (schedule.frequency !== "once" || !schedule.runAt) return;
  if (Date.parse(schedule.runAt) <= now.getTime()) {
    throw new AutomationPlatformError("automation_invalid_schedule", {
      reason: "past_run_at",
      runAt: schedule.runAt,
    });
  }
}

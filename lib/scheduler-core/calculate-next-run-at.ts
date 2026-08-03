/**
 * Canonical server-side nextRunAt calculation (Phase 2-2).
 * UTC ISO output; wall-clock interpreted in owner IANA timezone.
 * Deterministic for the same inputs. Locale-independent.
 */

import {
  addCalendarDays,
  clampDayOfMonth,
  DEFAULT_AUTOMATION_PLATFORM_TIMEZONE,
  getZonedParts,
  isValidTimeZone,
  resolveTimeZone,
  zonedTimeToUtc,
} from "@/lib/automation-platform/schedule/timezone";
import type { AutomationSchedule } from "@/lib/automations/types";
import type { AutomationScheduleSpec } from "@/lib/automation-platform/types";

import type { CalculateNextRunAtInput, SchedulerRecurrence } from "./types";

export class SchedulerNextRunError extends Error {
  readonly code = "scheduler_invalid_schedule";
  constructor(message: string) {
    super(message);
    this.name = "SchedulerNextRunError";
  }
}

function assertHourMinute(hour: number, minute: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new SchedulerNextRunError(`invalid hour: ${hour}`);
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new SchedulerNextRunError(`invalid minute: ${minute}`);
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
  if (unique.length === 0) {
    throw new SchedulerNextRunError("daysOfWeek required");
  }
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
  throw new SchedulerNextRunError("unable_to_compute_weekday");
}

/**
 * calculateNextRunAt — single SoT for next fire time.
 * Returns UTC Date strictly after `from` (except once in future).
 * Past one-shot → null. End date passed → null.
 */
export function calculateNextRunAt(
  input: CalculateNextRunAtInput,
): Date | null {
  const from = input.from ?? new Date();
  if (Number.isNaN(from.getTime())) {
    throw new SchedulerNextRunError("invalid from date");
  }
  if (!isValidTimeZone(input.timezone) && input.timezone) {
    // resolve with fallback but still fail-closed on empty garbage when explicit invalid
    if (input.timezone.length > 0 && !isValidTimeZone(input.timezone)) {
      throw new SchedulerNextRunError(`invalid timezone: ${input.timezone}`);
    }
  }
  const timeZone = resolveTimeZone(
    input.timezone,
    DEFAULT_AUTOMATION_PLATFORM_TIMEZONE,
  );
  const recurrence = input.recurrence;

  if (input.startAt && Date.parse(input.startAt) > from.getTime()) {
    return calculateNextRunAt({
      ...input,
      startAt: null,
      from: new Date(input.startAt),
    });
  }
  if (input.endAt && Date.parse(input.endAt) <= from.getTime()) {
    return null;
  }

  if (recurrence.frequency === "once") {
    const runAt = new Date(recurrence.runAt);
    if (Number.isNaN(runAt.getTime())) {
      throw new SchedulerNextRunError("invalid runAt");
    }
    if (runAt.getTime() <= from.getTime()) return null;
    if (input.endAt && runAt.getTime() >= Date.parse(input.endAt)) return null;
    return runAt;
  }

  assertHourMinute(recurrence.hour, recurrence.minute);
  const parts = getZonedParts(from, timeZone);
  let next: Date;

  switch (recurrence.frequency) {
    case "daily": {
      next = candidateAt(
        parts.year,
        parts.month,
        parts.day,
        recurrence.hour,
        recurrence.minute,
        timeZone,
      );
      if (next.getTime() <= from.getTime()) {
        const d = addCalendarDays(parts.year, parts.month, parts.day, 1);
        next = candidateAt(
          d.year,
          d.month,
          d.day,
          recurrence.hour,
          recurrence.minute,
          timeZone,
        );
      }
      break;
    }
    case "weekdays": {
      next = nextWeekdayMatch(
        parts,
        [1, 2, 3, 4, 5],
        recurrence.hour,
        recurrence.minute,
        timeZone,
        from,
      );
      break;
    }
    case "weekly":
    case "custom_days": {
      next = nextWeekdayMatch(
        parts,
        recurrence.daysOfWeek,
        recurrence.hour,
        recurrence.minute,
        timeZone,
        from,
      );
      break;
    }
    case "monthly": {
      const day = clampDayOfMonth(
        parts.year,
        parts.month,
        recurrence.dayOfMonth,
      );
      next = candidateAt(
        parts.year,
        parts.month,
        day,
        recurrence.hour,
        recurrence.minute,
        timeZone,
      );
      if (next.getTime() <= from.getTime()) {
        let month = parts.month + 1;
        let year = parts.year;
        if (month > 12) {
          month = 1;
          year += 1;
        }
        const nextDay = clampDayOfMonth(year, month, recurrence.dayOfMonth);
        next = candidateAt(
          year,
          month,
          nextDay,
          recurrence.hour,
          recurrence.minute,
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
        recurrence.hour,
        recurrence.minute,
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
          recurrence.hour,
          recurrence.minute,
          timeZone,
        );
      }
      break;
    }
    default: {
      const _exhaustive: never = recurrence;
      throw new SchedulerNextRunError(
        `unsupported frequency: ${(_exhaustive as SchedulerRecurrence).frequency}`,
      );
    }
  }

  if (input.endAt && next.getTime() >= Date.parse(input.endAt)) {
    return null;
  }
  return next;
}

export function calculateNextRunAtIso(
  input: CalculateNextRunAtInput,
): string | null {
  const next = calculateNextRunAt(input);
  return next ? next.toISOString() : null;
}

/** Map V1 AutomationSchedule → canonical recurrence. */
export function recurrenceFromV1Schedule(
  schedule: AutomationSchedule,
): SchedulerRecurrence | null {
  if (schedule.kind !== "schedule") return null;
  const preset = schedule.preset;
  switch (preset.type) {
    case "daily":
      return {
        frequency: "daily",
        hour: preset.hour,
        minute: preset.minute,
      };
    case "weekly":
      return {
        frequency: "weekly",
        hour: preset.hour,
        minute: preset.minute,
        daysOfWeek: [preset.dayOfWeek],
      };
    case "monthly":
      return {
        frequency: "monthly",
        hour: preset.hour,
        minute: preset.minute,
        dayOfMonth: preset.dayOfMonth,
      };
    default:
      return null;
  }
}

export function calculateNextRunAtFromV1Schedule(
  schedule: AutomationSchedule,
  from: Date = new Date(),
): Date | null {
  const recurrence = recurrenceFromV1Schedule(schedule);
  if (!recurrence || schedule.kind !== "schedule") return null;
  return calculateNextRunAt({
    recurrence,
    timezone: schedule.timezone || DEFAULT_AUTOMATION_PLATFORM_TIMEZONE,
    from,
  });
}

export function calculateNextRunAtIsoFromV1Schedule(
  schedule: AutomationSchedule,
  from: Date = new Date(),
): string | null {
  const next = calculateNextRunAtFromV1Schedule(schedule, from);
  return next ? next.toISOString() : null;
}

/** Map V2 schedule spec → canonical recurrence. */
export function recurrenceFromV2Schedule(
  schedule: AutomationScheduleSpec,
): SchedulerRecurrence {
  switch (schedule.frequency) {
    case "once":
      return { frequency: "once", runAt: schedule.runAt ?? "" };
    case "daily":
      return {
        frequency: "daily",
        hour: schedule.hour,
        minute: schedule.minute,
      };
    case "weekly":
      return {
        frequency: "weekly",
        hour: schedule.hour,
        minute: schedule.minute,
        daysOfWeek: schedule.daysOfWeek ?? [],
      };
    case "custom_days":
      return {
        frequency: "custom_days",
        hour: schedule.hour,
        minute: schedule.minute,
        daysOfWeek: schedule.daysOfWeek ?? [],
      };
    case "monthly":
      return {
        frequency: "monthly",
        hour: schedule.hour,
        minute: schedule.minute,
        dayOfMonth: schedule.dayOfMonth ?? 1,
      };
    case "month_end":
      return {
        frequency: "month_end",
        hour: schedule.hour,
        minute: schedule.minute,
      };
    case "weekdays":
      return {
        frequency: "weekdays",
        hour: schedule.hour,
        minute: schedule.minute,
      };
    default:
      throw new SchedulerNextRunError(
        `unsupported v2 frequency: ${String((schedule as { frequency: string }).frequency)}`,
      );
  }
}

export function calculateNextRunAtFromV2Schedule(
  schedule: AutomationScheduleSpec,
  timezone: string,
  from: Date = new Date(),
): Date | null {
  return calculateNextRunAt({
    recurrence: recurrenceFromV2Schedule(schedule),
    timezone,
    from,
    startAt: schedule.startAt,
    endAt: schedule.endAt,
  });
}

/** Skip next: advance from scheduled slot + 60s (scheduledAt basis). */
export function calculateSkipNextRunAtIso(
  schedule: AutomationSchedule,
  currentNextRun: string | null,
): string | null {
  const from = currentNextRun
    ? new Date(new Date(currentNextRun).getTime() + 60_000)
    : new Date();
  return calculateNextRunAtIsoFromV1Schedule(schedule, from);
}

/** Resume: next future slot from now (no backlog catch-up). */
export function calculateResumeNextRunAtIso(
  schedule: AutomationSchedule,
  from: Date = new Date(),
): string | null {
  return calculateNextRunAtIsoFromV1Schedule(schedule, from);
}

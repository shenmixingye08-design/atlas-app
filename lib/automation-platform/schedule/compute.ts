import type {
  AutomationScheduleSpec,
  AutomationTrigger,
  ScheduleFrequency,
} from "@/lib/automation-platform/types";
import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import {
  calculateNextRunAtFromV2Schedule,
  SchedulerNextRunError,
} from "@/lib/scheduler-core/calculate-next-run-at";

import {
  DEFAULT_AUTOMATION_PLATFORM_TIMEZONE,
  isValidTimeZone,
  resolveTimeZone,
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

/**
 * Compute the next run strictly in the future relative to `from`.
 * Phase 2-2: delegates to scheduler-core calculateNextRunAt (server-side SoT).
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
  try {
    return calculateNextRunAtFromV2Schedule(schedule, timeZone, from);
  } catch (error) {
    if (error instanceof SchedulerNextRunError) {
      throw new AutomationPlatformError("automation_invalid_schedule", {
        reason: error.message,
      });
    }
    throw error;
  }
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

/** Guard: one-shot in the past is invalid at create time. */
export function assertNotPastOneShot(
  schedule: AutomationScheduleSpec,
  now: Date = new Date(),
): void {
  if (schedule.frequency !== "once" || !schedule.runAt) return;
  if (Date.parse(schedule.runAt) <= now.getTime()) {
    throw new AutomationPlatformError("automation_invalid_schedule", {
      field: "runAt",
      reason: "past_one_shot",
    });
  }
}

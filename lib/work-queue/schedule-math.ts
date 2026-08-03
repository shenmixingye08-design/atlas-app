import {
  computeNextRun,
  computeNextRunIso,
  getZonedParts,
  DEFAULT_AUTOMATION_TIMEZONE,
} from "@/lib/automations/schedule";
import {
  calculateResumeNextRunAtIso,
  calculateSkipNextRunAtIso,
} from "@/lib/scheduler-core/calculate-next-run-at";
import type { AutomationSchedule } from "@/lib/automations/types";

export {
  computeNextRun,
  computeNextRunIso,
  getZonedParts,
  DEFAULT_AUTOMATION_TIMEZONE,
};

/** Last calendar day of month in timezone. */
export function lastDayOfMonthInTz(
  year: number,
  month: number,
  timeZone: string,
): number {
  for (let day = 31; day >= 28; day -= 1) {
    const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const parts = getZonedParts(probe, timeZone);
    if (parts.month === month) return day;
  }
  return 28;
}

/** True if date is Mon–Fri in timezone. */
export function isWeekdayInTz(date: Date, timeZone: string): boolean {
  const parts = getZonedParts(date, timeZone);
  return parts.dayOfWeek >= 1 && parts.dayOfWeek <= 5;
}

/**
 * Resume helper: next run is always in the future from `from`.
 * Never catches up a backlog of missed occurrences.
 */
export function computeResumeNextRunIso(
  schedule: AutomationSchedule,
  from: Date = new Date(),
): string | null {
  return calculateResumeNextRunAtIso(schedule, from);
}

/** Skip the immediate next occurrence (advance from that slot). */
export function computeSkipNextRunIso(
  schedule: AutomationSchedule,
  currentNextRun: string | null,
): string | null {
  return calculateSkipNextRunAtIso(schedule, currentNextRun);
}

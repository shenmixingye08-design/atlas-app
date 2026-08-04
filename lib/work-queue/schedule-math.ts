import {
  computeNextRun,
  computeNextRunIso,
  getZonedParts,
  DEFAULT_AUTOMATION_TIMEZONE,
} from "@/lib/automations/schedule";
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
  // month is 1-12; day 0 of next month = last day of this month in UTC guess, then verify in TZ.
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
  return computeNextRunIso(schedule, from);
}

/** Skip the immediate next occurrence (advance from that slot). */
export function computeSkipNextRunIso(
  schedule: AutomationSchedule,
  currentNextRun: string | null,
): string | null {
  const from = currentNextRun ? new Date(currentNextRun) : new Date();
  // +1 minute past the scheduled slot so computeNextRun moves forward.
  return computeNextRunIso(schedule, new Date(from.getTime() + 60_000));
}

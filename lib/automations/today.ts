import type { Automation, AutomationTiming, Timestamp } from "./types";
import {
  DEFAULT_AUTOMATION_TIMEZONE,
  getZonedParts,
  isSameCalendarDayInZone,
} from "./schedule";
import { DEFAULT_AUTOMATION_TIMING } from "./timing-defaults";

function resolveTimeZone(automation: Automation): string {
  if (automation.schedule?.kind === "schedule") {
    return automation.schedule.timezone || DEFAULT_AUTOMATION_TIMEZONE;
  }
  return DEFAULT_AUTOMATION_TIMEZONE;
}

export function hasAutomationEnded(
  automation: Automation,
  now: Date = new Date(),
): boolean {
  const end = automation.timing?.endCondition ?? DEFAULT_AUTOMATION_TIMING.endCondition;
  if (end.type === "until_date") {
    return new Date(end.until).getTime() < now.getTime();
  }
  if (end.type === "occurrence_count") {
    return end.completedOccurrences >= end.maxOccurrences;
  }
  return false;
}

export function hasAutomationStarted(
  automation: Automation,
  now: Date = new Date(),
): boolean {
  const startDate = automation.timing?.startDate;
  if (!startDate) return true;
  return new Date(startDate).getTime() <= now.getTime();
}

/** True when this automation has a run scheduled for the given calendar day. */
export function isAutomationScheduledForToday(
  automation: Automation,
  now: Date = new Date(),
): boolean {
  if (!automation?.enabled || automation.schedule?.kind !== "schedule") return false;
  if (!hasAutomationStarted(automation, now) || hasAutomationEnded(automation, now)) {
    return false;
  }

  const timeZone = resolveTimeZone(automation);
  const parts = getZonedParts(now, timeZone);
  const preset = automation.schedule.preset;
  if (!preset?.type) return false;

  switch (preset.type) {
    case "daily":
      return true;
    case "weekly":
      return preset.dayOfWeek === parts.dayOfWeek;
    case "monthly":
      return preset.dayOfMonth === parts.day;
  }
}

export function wasAutomationCompletedToday(
  automation: Automation,
  now: Date = new Date(),
): boolean {
  if (!automation.lastRun) return false;
  const timeZone = resolveTimeZone(automation);
  return (
    isSameCalendarDayInZone(new Date(automation.lastRun), now, timeZone) &&
    automation.status === "success"
  );
}

export type TodayAutomationItem = {
  automation: Automation;
  completed: boolean;
};

/** Automations that run today, for the home dashboard checklist. */
export function getTodaysAutomations(
  automations: readonly Automation[],
  now: Date = new Date(),
): TodayAutomationItem[] {
  return automations
    .filter((automation) => isAutomationScheduledForToday(automation, now))
    .map((automation) => ({
      automation,
      completed: wasAutomationCompletedToday(automation, now),
    }))
    .sort((a, b) => a.automation.name.localeCompare(b.automation.name, "ja"));
}

export function formatDateInputValue(iso: Timestamp | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInputValue(value: string): Timestamp | null {
  if (!value.trim()) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

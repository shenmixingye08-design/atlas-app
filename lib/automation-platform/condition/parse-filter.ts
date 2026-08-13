import type { AutomationTrigger } from "@/lib/automation-platform/types/trigger";

import type {
  CalendarEventTitleConditionFilter,
  ConditionMatchMode,
} from "./types";

const SUPPORTED_EXPRESSIONS = new Set([
  "google_calendar.event_title_match",
  "google_calendar.event_title_equals",
  "provider_resource_exists",
]);

export function isSupportedConditionExpression(expression: string): boolean {
  return SUPPORTED_EXPRESSIONS.has(expression.trim());
}

export function parseCalendarTitleFilterFromTrigger(
  trigger: AutomationTrigger,
): CalendarEventTitleConditionFilter | null {
  if (trigger.type !== "condition" && trigger.type !== "event") return null;

  const filter = trigger.event?.filter ?? {};
  const titleRaw =
    (typeof filter.title === "string" && filter.title) ||
    (typeof filter.titleEquals === "string" && filter.titleEquals) ||
    (typeof filter.titleContains === "string" && filter.titleContains) ||
    "";
  const title = titleRaw.trim();
  if (!title) return null;

  const matchMode: ConditionMatchMode =
    filter.matchMode === "contains" ||
    typeof filter.titleContains === "string"
      ? "contains"
      : "equals";

  return {
    title,
    matchMode,
    calendarId:
      typeof filter.calendarId === "string" && filter.calendarId.trim()
        ? filter.calendarId.trim()
        : "primary",
    lookbackDays:
      typeof filter.lookbackDays === "number" && filter.lookbackDays > 0
        ? Math.min(filter.lookbackDays, 90)
        : 30,
    lookaheadDays:
      typeof filter.lookaheadDays === "number" && filter.lookaheadDays > 0
        ? Math.min(filter.lookaheadDays, 366)
        : 365,
  };
}

export function resolveConditionProvider(
  trigger: AutomationTrigger,
): string | null {
  if (trigger.event?.source?.trim()) return trigger.event.source.trim();
  const expression = trigger.condition?.expression ?? "";
  if (expression.startsWith("google_calendar.")) return "google_calendar";
  return null;
}

export function resolveConditionEventType(
  trigger: AutomationTrigger,
): string {
  if (trigger.event?.eventType?.trim()) return trigger.event.eventType.trim();
  return trigger.condition?.expression?.trim() || "condition";
}

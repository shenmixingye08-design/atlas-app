import { DEFAULT_AUTOMATION_TIMEZONE, getZonedParts } from "@/lib/automations/schedule";

import type { SuggestionTimeContext } from "./types";

const WEEKDAY_LABELS = [
  "日曜",
  "月曜",
  "火曜",
  "水曜",
  "木曜",
  "金曜",
  "土曜",
] as const;

export function buildSuggestionTimeContext(
  now: Date = new Date(),
  timeZone: string = DEFAULT_AUTOMATION_TIMEZONE,
): SuggestionTimeContext {
  const parts = getZonedParts(now, timeZone);
  return {
    timeZone,
    weekdayLabel: WEEKDAY_LABELS[parts.dayOfWeek] ?? "今日",
    dayOfWeek: parts.dayOfWeek,
    hour: parts.hour,
    minute: parts.minute,
    dayOfMonth: parts.day,
  };
}

/** Minutes from now to a scheduled hour:minute today (negative if passed). */
export function minutesUntilScheduledTime(
  context: SuggestionTimeContext,
  hour: number,
  minute: number,
): number {
  return hour * 60 + minute - (context.hour * 60 + context.minute);
}

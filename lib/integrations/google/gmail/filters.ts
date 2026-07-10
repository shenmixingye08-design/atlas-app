import { getZonedParts } from "@/lib/automations/schedule";

import { GMAIL_TIMEZONE } from "./constants";
import type { GmailFilterId } from "./types";

const FILTER_LABELS: Record<GmailFilterId, string> = {
  unread: "未読",
  today: "今日",
  this_week: "今週",
};

function formatGmailDate(year: number, month: number, day: number): string {
  return `${year}/${month}/${day}`;
}

function addDays(year: number, month: number, day: number, amount: number) {
  const base = new Date(Date.UTC(year, month - 1, day + amount, 12, 0, 0, 0));
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
  };
}

function mondayOfWeekContaining(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const daysFromMonday = (parts.dayOfWeek + 6) % 7;
  return addDays(parts.year, parts.month, parts.day, -daysFromMonday);
}

export function isGmailFilterId(value: string): value is GmailFilterId {
  return value === "unread" || value === "today" || value === "this_week";
}

export function resolveGmailSearchQuery(
  filter: GmailFilterId,
  now: Date = new Date(),
  timeZone: string = GMAIL_TIMEZONE,
): { filter: GmailFilterId; label: string; query: string } {
  if (filter === "unread") {
    return {
      filter,
      label: FILTER_LABELS[filter],
      query: "is:unread in:inbox",
    };
  }

  const parts = getZonedParts(now, timeZone);

  if (filter === "today") {
    const tomorrow = addDays(parts.year, parts.month, parts.day, 1);
    return {
      filter,
      label: FILTER_LABELS[filter],
      query: `after:${formatGmailDate(parts.year, parts.month, parts.day)} before:${formatGmailDate(tomorrow.year, tomorrow.month, tomorrow.day)} in:inbox`,
    };
  }

  const monday = mondayOfWeekContaining(now, timeZone);
  return {
    filter,
    label: FILTER_LABELS[filter],
    query: `after:${formatGmailDate(monday.year, monday.month, monday.day)} in:inbox`,
  };
}

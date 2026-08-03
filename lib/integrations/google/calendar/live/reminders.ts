/**
 * Reminder validation — respect Google Calendar API limits.
 */

import type { CalendarReminderInput } from "./types";

/** Google allows up to 5 overrides; minutes 0..40320 (4 weeks). */
const MAX_OVERRIDES = 5;
const MAX_MINUTES = 40320;

export function resolveCalendarReminders(
  value: unknown,
): CalendarReminderInput[] | "default" | "none" {
  if (value == null || value === "default" || value === true) return "default";
  if (value === false || value === "none") return "none";

  if (typeof value === "number") {
    if (value < 0 || value > MAX_MINUTES) {
      throw new Error("calendar invalid reminder: minutes out of range");
    }
    return [{ method: "popup", minutes: Math.floor(value) }];
  }

  if (!Array.isArray(value)) {
    throw new Error("calendar invalid reminder");
  }
  if (value.length > MAX_OVERRIDES) {
    throw new Error(`calendar invalid reminder: max ${MAX_OVERRIDES}`);
  }

  const reminders: CalendarReminderInput[] = [];
  for (const item of value) {
    if (typeof item === "number") {
      if (item < 0 || item > MAX_MINUTES) {
        throw new Error("calendar invalid reminder: minutes out of range");
      }
      reminders.push({ method: "popup", minutes: Math.floor(item) });
      continue;
    }
    if (!item || typeof item !== "object") {
      throw new Error("calendar invalid reminder entry");
    }
    const row = item as Record<string, unknown>;
    const method = String(row.method ?? "popup").toLowerCase();
    if (method !== "popup" && method !== "email") {
      throw new Error("calendar invalid reminder: method");
    }
    const minutes =
      typeof row.minutes === "number"
        ? row.minutes
        : typeof row.minutesBefore === "number"
          ? row.minutesBefore
          : NaN;
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > MAX_MINUTES) {
      throw new Error("calendar invalid reminder: minutes out of range");
    }
    reminders.push({
      method,
      minutes: Math.floor(minutes),
    });
  }
  return reminders;
}

export function toGoogleRemindersBody(
  reminders: CalendarReminderInput[] | "default" | "none",
): Record<string, unknown> | undefined {
  if (reminders === "default") return { useDefault: true };
  if (reminders === "none") return { useDefault: false, overrides: [] };
  return {
    useDefault: false,
    overrides: reminders.map((item) => ({
      method: item.method,
      minutes: item.minutes,
    })),
  };
}

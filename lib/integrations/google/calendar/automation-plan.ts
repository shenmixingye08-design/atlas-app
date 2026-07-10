import { DEFAULT_CALENDAR_NOTIFY_MINUTES_BEFORE } from "./constants";
import type { CalendarAutomationTrigger, CalendarEvent } from "./types";

/**
 * Builds automation trigger schedule for calendar-aware automations.
 * Design: if user has events today → notify before start → run work after end.
 */
export function buildCalendarAutomationTriggers(
  events: readonly CalendarEvent[],
  options?: {
    notifyMinutesBefore?: number;
    now?: Date;
  },
): CalendarAutomationTrigger[] {
  const notifyMinutesBefore =
    options?.notifyMinutesBefore ?? DEFAULT_CALENDAR_NOTIFY_MINUTES_BEFORE;
  const now = options?.now ?? new Date();
  const triggers: CalendarAutomationTrigger[] = [];

  for (const event of events) {
    const startMs = new Date(event.startAt).getTime();
    const endMs = new Date(event.endAt).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;

    const notifyAt = new Date(
      startMs - notifyMinutesBefore * 60 * 1000,
    ).toISOString();

    if (new Date(notifyAt).getTime() > now.getTime()) {
      triggers.push({
        eventId: event.id,
        title: event.title,
        kind: "pre_event_notify",
        scheduledAt: notifyAt,
        eventStartAt: event.startAt,
        eventEndAt: event.endAt,
      });
    }

    if (endMs > now.getTime()) {
      triggers.push({
        eventId: event.id,
        title: event.title,
        kind: "post_event_work",
        scheduledAt: new Date(endMs).toISOString(),
        eventStartAt: event.startAt,
        eventEndAt: event.endAt,
      });
    }
  }

  return triggers.sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );
}

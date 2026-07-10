import "server-only";

import { CALENDAR_API_BASE } from "./constants";
import type { CalendarEvent } from "./types";

type GoogleCalendarDateTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

type GoogleCalendarEventItem = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleCalendarDateTime;
  end?: GoogleCalendarDateTime;
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarEventItem[];
  error?: { message?: string };
};

function parseEventDateTime(value: GoogleCalendarDateTime | undefined): {
  iso: string;
  isAllDay: boolean;
} | null {
  if (!value) return null;

  if (value.dateTime) {
    return { iso: new Date(value.dateTime).toISOString(), isAllDay: false };
  }

  if (value.date) {
    return { iso: `${value.date}T00:00:00.000Z`, isAllDay: true };
  }

  return null;
}

export function normalizeGoogleCalendarEvent(
  item: GoogleCalendarEventItem,
): CalendarEvent | null {
  const start = parseEventDateTime(item.start);
  const end = parseEventDateTime(item.end);
  if (!start || !end || !item.id) return null;

  return {
    id: item.id,
    title: item.summary?.trim() || "(タイトルなし)",
    startAt: start.iso,
    endAt: end.iso,
    location: item.location?.trim() || null,
    isAllDay: start.isAllDay || end.isAllDay,
    description: item.description?.trim() || null,
  };
}

export async function fetchGoogleCalendarEvents(input: {
  accessToken: string;
  timeMin: string;
  timeMax: string;
  calendarId?: string;
}): Promise<CalendarEvent[]> {
  const calendarId = encodeURIComponent(input.calendarId ?? "primary");
  const params = new URLSearchParams({
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });

  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/${calendarId}/events?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as GoogleCalendarListResponse;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "Failed to fetch Google Calendar events",
    );
  }

  return (payload.items ?? [])
    .map(normalizeGoogleCalendarEvent)
    .filter((event): event is CalendarEvent => event !== null)
    .sort(
      (a, b) =>
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
}

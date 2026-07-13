import "server-only";

import { CALENDAR_API_BASE } from "./constants";
import { CALENDAR_TIMEZONE } from "./ranges";
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarFreeSlot,
} from "./types";

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
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
  start?: GoogleCalendarDateTime;
  end?: GoogleCalendarDateTime;
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarEventItem[];
  error?: { message?: string };
};

type GoogleCalendarDirectoryItem = {
  id?: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
};

type GoogleCalendarDirectoryResponse = {
  items?: GoogleCalendarDirectoryItem[];
  error?: { message?: string };
};

type GoogleFreeBusyResponse = {
  calendars?: {
    primary?: {
      busy?: { start?: string; end?: string }[];
    };
  };
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

function extractMeetLink(item: GoogleCalendarEventItem): string | null {
  if (item.hangoutLink?.trim()) return item.hangoutLink.trim();
  const video = item.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video" && entry.uri,
  );
  return video?.uri?.trim() ?? null;
}

function toGoogleEventBody(input: CalendarEventInput): Record<string, unknown> {
  const timeZone = CALENDAR_TIMEZONE;
  const body: Record<string, unknown> = {
    summary: input.title.trim(),
    description: input.description?.trim() || undefined,
    location: input.location?.trim() || undefined,
  };

  if (input.isAllDay) {
    const startDate = input.startAt.slice(0, 10);
    let endDate = input.endAt.slice(0, 10);
    // Google Calendar uses exclusive end dates for all-day events.
    if (endDate <= startDate) {
      const next = new Date(`${startDate}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      endDate = next.toISOString().slice(0, 10);
    }
    body.start = { date: startDate };
    body.end = { date: endDate };
  } else {
    body.start = { dateTime: input.startAt, timeZone };
    body.end = { dateTime: input.endAt, timeZone };
  }

  if (input.createMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `atlas-meet-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  if (
    typeof input.remindMinutesBefore === "number" &&
    input.remindMinutesBefore >= 0
  ) {
    body.reminders = {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: input.remindMinutesBefore },
        { method: "email", minutes: input.remindMinutesBefore },
      ],
    };
  }

  return body;
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
    meetLink: extractMeetLink(item),
    htmlLink: item.htmlLink?.trim() || null,
  };
}

async function calendarFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (response.status === 204) {
    return {} as T;
  }

  const payload = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Google Calendar API request failed");
  }
  return payload;
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

  const payload = await calendarFetch<GoogleCalendarListResponse>(
    input.accessToken,
    `/calendars/${calendarId}/events?${params.toString()}`,
  );

  return (payload.items ?? [])
    .map(normalizeGoogleCalendarEvent)
    .filter((event): event is CalendarEvent => event !== null)
    .sort(
      (a, b) =>
        new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
}

export async function listGoogleCalendars(input: {
  accessToken: string;
}): Promise<
  {
    id: string;
    summary: string;
    primary: boolean;
    accessRole: string | null;
    backgroundColor: string | null;
  }[]
> {
  const payload = await calendarFetch<GoogleCalendarDirectoryResponse>(
    input.accessToken,
    "/users/me/calendarList?maxResults=250&minAccessRole=reader",
  );

  return (payload.items ?? [])
    .filter((item): item is GoogleCalendarDirectoryItem & { id: string } =>
      Boolean(item.id),
    )
    .map((item) => ({
      id: item.id,
      summary: item.summary?.trim() || item.id,
      primary: Boolean(item.primary),
      accessRole: item.accessRole?.trim() || null,
      backgroundColor: item.backgroundColor?.trim() || null,
    }))
    .sort((a, b) => {
      if (a.primary === b.primary) return a.summary.localeCompare(b.summary, "ja");
      return a.primary ? -1 : 1;
    });
}

export async function createGoogleCalendarEvent(input: {
  accessToken: string;
  event: CalendarEventInput;
  calendarId?: string;
}): Promise<CalendarEvent> {
  const calendarId = encodeURIComponent(input.calendarId ?? "primary");
  const params = new URLSearchParams();
  if (input.event.createMeet) {
    params.set("conferenceDataVersion", "1");
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await calendarFetch<GoogleCalendarEventItem>(
    input.accessToken,
    `/calendars/${calendarId}/events${query}`,
    {
      method: "POST",
      body: JSON.stringify(toGoogleEventBody(input.event)),
    },
  );

  const normalized = normalizeGoogleCalendarEvent(payload);
  if (!normalized) {
    throw new Error("Failed to create calendar event");
  }
  return normalized;
}

export async function updateGoogleCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  event: CalendarEventInput;
  calendarId?: string;
}): Promise<CalendarEvent> {
  const calendarId = encodeURIComponent(input.calendarId ?? "primary");
  const params = new URLSearchParams();
  if (input.event.createMeet) {
    params.set("conferenceDataVersion", "1");
  }
  const query = params.toString() ? `?${params.toString()}` : "";

  const payload = await calendarFetch<GoogleCalendarEventItem>(
    input.accessToken,
    `/calendars/${calendarId}/events/${encodeURIComponent(input.eventId)}${query}`,
    {
      method: "PATCH",
      body: JSON.stringify(toGoogleEventBody(input.event)),
    },
  );

  const normalized = normalizeGoogleCalendarEvent(payload);
  if (!normalized) {
    throw new Error("Failed to update calendar event");
  }
  return normalized;
}

export async function deleteGoogleCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  calendarId?: string;
}): Promise<void> {
  const calendarId = encodeURIComponent(input.calendarId ?? "primary");
  await calendarFetch(
    input.accessToken,
    `/calendars/${calendarId}/events/${encodeURIComponent(input.eventId)}`,
    { method: "DELETE" },
  );
}

export async function fetchGoogleCalendarFreeBusy(input: {
  accessToken: string;
  timeMin: string;
  timeMax: string;
}): Promise<{ start: string; end: string }[]> {
  const payload = await calendarFetch<GoogleFreeBusyResponse>(
    input.accessToken,
    "/freeBusy",
    {
      method: "POST",
      body: JSON.stringify({
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        timeZone: CALENDAR_TIMEZONE,
        items: [{ id: "primary" }],
      }),
    },
  );

  return (payload.calendars?.primary?.busy ?? [])
    .filter((slot): slot is { start: string; end: string } =>
      Boolean(slot.start && slot.end),
    )
    .map((slot) => ({ start: slot.start, end: slot.end }));
}

/**
 * Derive free slots inside [timeMin, timeMax] from busy intervals.
 * Only considers daytime windows 09:00–18:00 Asia/Tokyo by default.
 */
export function computeFreeSlots(input: {
  timeMin: string;
  timeMax: string;
  busy: readonly { start: string; end: string }[];
  slotMinutes?: number;
  dayStartHour?: number;
  dayEndHour?: number;
}): CalendarFreeSlot[] {
  const slotMinutes = input.slotMinutes ?? 30;
  const dayStartHour = input.dayStartHour ?? 9;
  const dayEndHour = input.dayEndHour ?? 18;
  const rangeStart = new Date(input.timeMin).getTime();
  const rangeEnd = new Date(input.timeMax).getTime();
  const busySorted = [...input.busy]
    .map((slot) => ({
      start: new Date(slot.start).getTime(),
      end: new Date(slot.end).getTime(),
    }))
    .filter((slot) => slot.end > rangeStart && slot.start < rangeEnd)
    .sort((a, b) => a.start - b.start);

  const free: CalendarFreeSlot[] = [];
  const cursorDay = new Date(rangeStart);

  while (cursorDay.getTime() < rangeEnd) {
    const dayParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: CALENDAR_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(cursorDay);
    const y = dayParts.find((p) => p.type === "year")?.value ?? "1970";
    const m = dayParts.find((p) => p.type === "month")?.value ?? "01";
    const d = dayParts.find((p) => p.type === "day")?.value ?? "01";

    const dayStart = new Date(
      `${y}-${m}-${d}T${String(dayStartHour).padStart(2, "0")}:00:00+09:00`,
    ).getTime();
    const dayEnd = new Date(
      `${y}-${m}-${d}T${String(dayEndHour).padStart(2, "0")}:00:00+09:00`,
    ).getTime();

    let pointer = Math.max(dayStart, rangeStart);
    const limit = Math.min(dayEnd, rangeEnd);
    const dayBusy = busySorted.filter(
      (slot) => slot.end > pointer && slot.start < limit,
    );

    for (const slot of dayBusy) {
      if (slot.start > pointer) {
        pushSlots(free, pointer, Math.min(slot.start, limit), slotMinutes);
      }
      pointer = Math.max(pointer, slot.end);
    }
    if (pointer < limit) {
      pushSlots(free, pointer, limit, slotMinutes);
    }

    cursorDay.setUTCDate(cursorDay.getUTCDate() + 1);
  }

  return free.slice(0, 40);
}

function pushSlots(
  target: CalendarFreeSlot[],
  startMs: number,
  endMs: number,
  slotMinutes: number,
): void {
  const duration = Math.floor((endMs - startMs) / 60000);
  if (duration < slotMinutes) return;

  // Prefer one contiguous free block rather than chopping every N minutes.
  target.push({
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
    durationMinutes: duration,
  });
}

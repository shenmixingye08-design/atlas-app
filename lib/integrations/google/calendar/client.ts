import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventsResult,
  CalendarFreeSlot,
  CalendarListResult,
  CalendarMeetingCandidate,
  CalendarOrganizeInsight,
  CalendarRangeId,
} from "./types";

export type { CalendarRangeId } from "./types";

export async function fetchGoogleCalendarEventsClient(
  range: CalendarRangeId,
): Promise<CalendarEventsResult> {
  const response = await fetch(
    `/api/google/calendar?range=${encodeURIComponent(range)}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      status?: string;
    } | null;

    if (
      body?.status === "google_not_connected" ||
      body?.status === "feature_disabled" ||
      body?.status === "plan_required" ||
      body?.status === "insufficient_permission" ||
      body?.status === "needs_reconnect"
    ) {
      return {
        status: body.status,
        message:
          body.message ??
          (body.status === "google_not_connected"
            ? "Googleを接続してください"
            : body.status === "insufficient_permission"
              ? "必要なGoogle権限が不足しています。再接続して権限を許可してください"
              : body.status === "needs_reconnect"
                ? "Google連携の有効期限が切れました。再接続してください"
                : "Google連携は現在ご利用いただけません"),
      };
    }

    throw new Error(body?.message ?? "Failed to load calendar events");
  }

  return response.json() as Promise<CalendarEventsResult>;
}

export async function fetchGoogleCalendarsClient(): Promise<CalendarListResult> {
  const response = await fetch("/api/google/calendar/calendars", {
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
      status?: string;
    } | null;

    if (
      body?.status === "google_not_connected" ||
      body?.status === "feature_disabled" ||
      body?.status === "plan_required" ||
      body?.status === "insufficient_permission" ||
      body?.status === "needs_reconnect"
    ) {
      return {
        status: body.status,
        message: body.message ?? "カレンダー一覧を取得できません",
      };
    }

    throw new Error(body?.message ?? "Failed to list calendars");
  }

  return response.json() as Promise<CalendarListResult>;
}

export async function createGoogleCalendarEventClient(
  event: CalendarEventInput,
): Promise<CalendarEvent> {
  const response = await fetch("/api/google/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to create event");
  }
  const payload = (await response.json()) as { event: CalendarEvent };
  return payload.event;
}

export async function updateGoogleCalendarEventClient(
  eventId: string,
  event: CalendarEventInput,
): Promise<CalendarEvent> {
  const response = await fetch(
    `/api/google/calendar/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to update event");
  }
  const payload = (await response.json()) as { event: CalendarEvent };
  return payload.event;
}

export async function deleteGoogleCalendarEventClient(
  eventId: string,
): Promise<void> {
  const response = await fetch(
    `/api/google/calendar/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to delete event");
  }
}

export async function fetchCalendarFreeSlotsClient(
  range: CalendarRangeId,
  slotMinutes = 30,
): Promise<CalendarFreeSlot[]> {
  const params = new URLSearchParams({
    range,
    slotMinutes: String(slotMinutes),
  });
  const response = await fetch(`/api/google/calendar/freebusy?${params}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to load free slots");
  }
  const payload = (await response.json()) as { slots: CalendarFreeSlot[] };
  return payload.slots ?? [];
}

export async function organizeCalendarClient(
  range: CalendarRangeId,
): Promise<CalendarOrganizeInsight> {
  const response = await fetch("/api/google/calendar/organize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ range }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to organize calendar");
  }
  const payload = (await response.json()) as {
    insight: CalendarOrganizeInsight;
  };
  return payload.insight;
}

export async function proposeMeetingsClient(input: {
  range: CalendarRangeId;
  durationMinutes?: number;
  purpose?: string;
}): Promise<CalendarMeetingCandidate[]> {
  const response = await fetch("/api/google/calendar/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(body?.message ?? "Failed to propose meetings");
  }
  const payload = (await response.json()) as {
    candidates: CalendarMeetingCandidate[];
  };
  return payload.candidates ?? [];
}

export function formatCalendarEventWhen(
  event: {
    startAt: string;
    endAt: string;
    isAllDay: boolean;
  },
  locale = "ja-JP",
): string {
  if (event.isAllDay) {
    const start = new Date(event.startAt);
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(start);
  }

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    start,
  );
  const startTime = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(start);
  const endTime = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(end);

  return `${date} ${startTime} – ${endTime}`;
}

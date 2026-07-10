import type {
  CalendarEventsResult,
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

    if (body?.status === "google_not_connected") {
      return {
        status: "google_not_connected",
        message: body.message ?? "Googleを接続してください",
      };
    }

    if (body?.status === "feature_disabled") {
      return {
        status: "feature_disabled",
        message: body.message ?? "Google連携は現在ご利用いただけません",
      };
    }

    throw new Error(body?.message ?? "Failed to load calendar events");
  }

  return response.json() as Promise<CalendarEventsResult>;
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

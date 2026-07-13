import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  createCalendarEventForUser,
  getGoogleCalendarEventsForUser,
  parseCalendarRangeParam,
} from "@/lib/integrations/google/calendar/service";
import type { CalendarEventInput } from "@/lib/integrations/google/calendar/types";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
import { notifyCalendarReminder } from "@/lib/notifications/emitters";

function parseEventBody(body: unknown): CalendarEventInput | null {
  if (!body || typeof body !== "object") return null;
  const row = body as Record<string, unknown>;
  if (typeof row.title !== "string" || !row.title.trim()) return null;
  if (typeof row.startAt !== "string" || typeof row.endAt !== "string") {
    return null;
  }

  return {
    title: row.title.trim(),
    startAt: row.startAt,
    endAt: row.endAt,
    description: typeof row.description === "string" ? row.description : null,
    location: typeof row.location === "string" ? row.location : null,
    isAllDay: Boolean(row.isAllDay),
    createMeet: Boolean(row.createMeet),
    remindMinutesBefore:
      typeof row.remindMinutesBefore === "number"
        ? row.remindMinutesBefore
        : null,
  };
}

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const rangeParam = new URL(request.url).searchParams.get("range");
  const range = parseCalendarRangeParam(rangeParam) ?? "today";
  const context = await resolveFeatureAccessContext();

  try {
    const result = await getGoogleCalendarEventsForUser({
      userId,
      range,
      context,
    });

    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }

    if (range === "today") {
      const now = Date.now();
      const upcoming = result.snapshot.events.find((event) => {
        const start = new Date(event.startAt).getTime();
        return start > now && start - now <= 60 * 60 * 1000;
      });
      if (upcoming) {
        notifyCalendarReminder(
          userId,
          `まもなく「${upcoming.title}」が始まります`,
        );
      }
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load calendar";
    recordGoogleAuthFailure(message, "google_calendar_list");
    return Response.json(
      { status: "error", message: "予定の取得に失敗しました" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const event = parseEventBody(body);
  if (!event) {
    return Response.json(
      { message: "title, startAt, and endAt are required" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();

  try {
    const result = await createCalendarEventForUser({
      userId,
      context,
      event,
    });
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create event";
    recordGoogleAuthFailure(message, "google_calendar_create");
    return Response.json({ message: "予定の追加に失敗しました" }, { status: 500 });
  }
}

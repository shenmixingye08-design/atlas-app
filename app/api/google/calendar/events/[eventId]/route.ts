import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  deleteCalendarEventForUser,
  updateCalendarEventForUser,
} from "@/lib/integrations/google/calendar/service";
import type { CalendarEventInput } from "@/lib/integrations/google/calendar/types";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

type Params = { params: Promise<{ eventId: string }> };

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

export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await params;
  const event = parseEventBody(await request.json().catch(() => null));
  if (!event) {
    return Response.json(
      { message: "title, startAt, and endAt are required" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();

  try {
    const result = await updateCalendarEventForUser({
      userId,
      context,
      eventId,
      event,
    });
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update event";
    recordGoogleAuthFailure(message, "google_calendar_update");
    return Response.json({ message: "予定の変更に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { eventId } = await params;
  const context = await resolveFeatureAccessContext();

  try {
    const result = await deleteCalendarEventForUser({
      userId,
      context,
      eventId,
    });
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete event";
    recordGoogleAuthFailure(message, "google_calendar_delete");
    return Response.json({ message: "予定の削除に失敗しました" }, { status: 500 });
  }
}

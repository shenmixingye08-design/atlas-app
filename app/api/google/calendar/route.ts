import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  getGoogleCalendarEventsForUser,
  parseCalendarRangeParam,
} from "@/lib/integrations/google/calendar/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
import { notifyCalendarReminder } from "@/lib/notifications/emitters";

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
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { listGoogleCalendarsForUser } from "@/lib/integrations/google/calendar/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const context = await resolveFeatureAccessContext();

  try {
    const result = await listGoogleCalendarsForUser({ userId, context });

    if (result.status !== "ready") {
      const statusCode =
        result.status === "feature_disabled"
          ? 403
          : result.status === "insufficient_permission" ||
              result.status === "needs_reconnect" ||
              result.status === "google_not_connected" ||
              result.status === "plan_required"
            ? 409
            : 409;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list calendars";
    recordGoogleAuthFailure(message, "google_calendar_list_calendars");
    return Response.json(
      { status: "error", message: "カレンダー一覧の取得に失敗しました" },
      { status: 500 },
    );
  }
}

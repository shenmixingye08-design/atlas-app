import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  findFreeSlotsForUser,
  parseCalendarRangeParam,
} from "@/lib/integrations/google/calendar/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const range = parseCalendarRangeParam(url.searchParams.get("range")) ?? "today";
  const slotMinutes = Number.parseInt(
    url.searchParams.get("slotMinutes") ?? "30",
    10,
  );
  const context = await resolveFeatureAccessContext();

  try {
    const result = await findFreeSlotsForUser({
      userId,
      context,
      range,
      slotMinutes: Number.isFinite(slotMinutes) ? slotMinutes : 30,
    });
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to find free slots";
    recordGoogleAuthFailure(message, "google_calendar_freebusy");
    return Response.json({ message: "空き時間の取得に失敗しました" }, { status: 500 });
  }
}

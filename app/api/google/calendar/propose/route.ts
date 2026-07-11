import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  parseCalendarRangeParam,
  proposeMeetingsForUser,
} from "@/lib/integrations/google/calendar/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    range?: unknown;
    durationMinutes?: unknown;
    purpose?: unknown;
  } | null;

  const range =
    parseCalendarRangeParam(
      typeof body?.range === "string" ? body.range : null,
    ) ?? "this_week";
  const durationMinutes =
    typeof body?.durationMinutes === "number" ? body.durationMinutes : 30;
  const purpose =
    typeof body?.purpose === "string" ? body.purpose.trim() : undefined;

  const context = await resolveFeatureAccessContext();

  const { requireBillingAiUsage } = await import("@/lib/billing/access");
  const usageDenied = await requireBillingAiUsage(userId);
  if (usageDenied) return usageDenied;

  try {
    const result = await proposeMeetingsForUser({
      userId,
      context,
      range,
      durationMinutes,
      purpose,
    });
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to propose meetings";
    recordGoogleAuthFailure(message, "google_calendar_propose");
    return Response.json(
      { message: "会議候補の提案に失敗しました" },
      { status: 500 },
    );
  }
}

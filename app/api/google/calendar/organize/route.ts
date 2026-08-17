import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  organizeCalendarForUser,
  parseCalendarRangeParam,
} from "@/lib/integrations/google/calendar/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    range?: unknown;
  } | null;
  const range =
    parseCalendarRangeParam(
      typeof body?.range === "string" ? body.range : null,
    ) ?? "today";
  const context = await resolveFeatureAccessContext();

  const { requireAndConsumeAiJob } = await import("@/lib/billing/access");
  const usageDenied = await requireAndConsumeAiJob(
    userId,
    "calendar_organize",
    request.headers.get("idempotency-key")?.trim() || crypto.randomUUID(),
  );
  if (usageDenied) return usageDenied;

  try {
    const result = await organizeCalendarForUser({ userId, context, range });
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }
    return Response.json(result);
  } catch (error) {
    const message =
      clientSafeMessage(error, "Failed to organize calendar");
    recordGoogleAuthFailure(message, "google_calendar_organize");
    return Response.json({ message: "予定整理に失敗しました" }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  getGmailMessagesForUser,
  parseGmailFilterParam,
} from "@/lib/integrations/google/gmail/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const filterParam = new URL(request.url).searchParams.get("filter");
  const filter = parseGmailFilterParam(filterParam) ?? "unread";
  const context = await resolveFeatureAccessContext();

  try {
    const result = await getGmailMessagesForUser({
      userId,
      filter,
      context,
    });

    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load Gmail messages";
    recordGoogleAuthFailure(message, "google_gmail_list");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

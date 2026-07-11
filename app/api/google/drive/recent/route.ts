import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { getRecentGoogleDriveFilesForUser } from "@/lib/integrations/google/drive/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const limitParam = new URL(request.url).searchParams.get("limit");
  const maxResults = limitParam ? Number.parseInt(limitParam, 10) : 8;
  const context = await resolveFeatureAccessContext();

  try {
    const result = await getRecentGoogleDriveFilesForUser({
      userId,
      context,
      maxResults: Number.isFinite(maxResults) ? maxResults : 8,
    });

    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load recent Drive files";
    recordGoogleAuthFailure(message, "google_drive_recent");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

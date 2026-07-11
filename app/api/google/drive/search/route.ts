import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { searchGoogleDriveForUser } from "@/lib/integrations/google/drive/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();
  if (!query) {
    return Response.json(
      { status: "error", message: "q is required" },
      { status: 400 },
    );
  }

  const parentId = url.searchParams.get("parentId");
  const context = await resolveFeatureAccessContext();

  try {
    const result = await searchGoogleDriveForUser({
      userId,
      context,
      query,
      parentId,
    });

    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to search Drive";
    recordGoogleAuthFailure(message, "google_drive_search");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

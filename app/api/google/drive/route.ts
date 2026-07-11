import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  getGoogleDriveFilesForUser,
  parseDriveCategoryParam,
} from "@/lib/integrations/google/drive/service";
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
  const categoryParam = url.searchParams.get("category");
  const category = parseDriveCategoryParam(categoryParam) ?? "all";
  const query = url.searchParams.get("q");
  const parentId = url.searchParams.get("parentId");
  const context = await resolveFeatureAccessContext();

  try {
    const result = await getGoogleDriveFilesForUser({
      userId,
      category,
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
      error instanceof Error ? error.message : "Failed to load Google Drive files";
    recordGoogleAuthFailure(message, "google_drive_list");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

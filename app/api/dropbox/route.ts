import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { getDropboxFilesForUser } from "@/lib/integrations/dropbox/service";
import { recordDropboxAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const path = url.searchParams.get("path");
  const query = url.searchParams.get("q");
  const context = await resolveFeatureAccessContext();

  try {
    const result = await getDropboxFilesForUser({
      userId,
      context,
      path,
      query,
    });

    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load Dropbox files";
    recordDropboxAuthFailure(message, "dropbox_list");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

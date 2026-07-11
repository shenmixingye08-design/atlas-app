import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { summarizeGoogleDriveFileForUser } from "@/lib/integrations/google/drive/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    fileId?: string;
  } | null;

  if (!body?.fileId?.trim()) {
    return Response.json(
      { status: "error", message: "fileId is required" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();

  try {
    const result = await summarizeGoogleDriveFileForUser({
      userId,
      context,
      fileId: body.fileId.trim(),
    });

    if (result.status !== "ready") {
      const statusCode =
        result.status === "feature_disabled"
          ? 403
          : result.status === "not_found"
            ? 404
            : 409;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to summarize Drive file";
    recordGoogleAuthFailure(message, "google_drive_ai_summarize");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

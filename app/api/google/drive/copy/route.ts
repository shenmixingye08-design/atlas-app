import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { copyGoogleDriveFileForUser } from "@/lib/integrations/google/drive/service";
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
    destinationFolderId?: string;
    newName?: string;
  } | null;

  if (!body?.fileId?.trim()) {
    return Response.json(
      { status: "error", message: "fileId is required" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();

  try {
    const result = await copyGoogleDriveFileForUser({
      userId,
      context,
      fileId: body.fileId.trim(),
      destinationFolderId: body.destinationFolderId?.trim() || null,
      newName: body.newName?.trim() || null,
    });

    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to copy Drive file";
    recordGoogleAuthFailure(message, "google_drive_copy");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { uploadBackupToGoogleDriveForUser } from "@/lib/integrations/google/drive/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

type RequestBody = {
  fileName?: unknown;
  base64?: unknown;
  mimeType?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json(
      { status: "error", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (typeof body.fileName !== "string" || !body.fileName.trim()) {
    return Response.json(
      { status: "error", message: "fileName is required" },
      { status: 400 },
    );
  }

  if (typeof body.base64 !== "string" || !body.base64.trim()) {
    return Response.json(
      { status: "error", message: "base64 is required" },
      { status: 400 },
    );
  }

  const mimeType =
    typeof body.mimeType === "string" && body.mimeType.trim()
      ? body.mimeType.trim()
      : "application/octet-stream";

  const context = await resolveFeatureAccessContext();

  try {
    const buffer = Buffer.from(body.base64, "base64");
    const result = await uploadBackupToGoogleDriveForUser({
      userId,
      context,
      fileName: body.fileName.trim(),
      mimeType,
      buffer,
    });

    if (result.status !== "ready") {
      const statusCode =
        result.status === "feature_disabled"
          ? 403
          : result.status === "google_not_connected"
            ? 409
            : 500;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload backup";
    recordGoogleAuthFailure(message, "google_drive_backup");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isDriveCategoryId } from "@/lib/integrations/google/drive/categories";
import { saveDeliverableToGoogleDriveForUser } from "@/lib/integrations/google/drive/service";
import type { DriveCategoryId } from "@/lib/integrations/google/drive/types";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
import { notifyDriveSaveComplete } from "@/lib/notifications/emitters";

type RequestBody = {
  deliverableId?: unknown;
  category?: unknown;
  overwriteFileId?: unknown;
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

  if (typeof body.deliverableId !== "string" || !body.deliverableId.trim()) {
    return Response.json(
      { status: "error", message: "deliverableId is required" },
      { status: 400 },
    );
  }

  const category =
    typeof body.category === "string" && isDriveCategoryId(body.category)
      ? (body.category as DriveCategoryId)
      : undefined;

  const overwriteFileId =
    typeof body.overwriteFileId === "string" && body.overwriteFileId.trim()
      ? body.overwriteFileId.trim()
      : null;

  const context = await resolveFeatureAccessContext();

  try {
    const result = await saveDeliverableToGoogleDriveForUser({
      userId,
      context,
      deliverableId: body.deliverableId.trim(),
      category,
      overwriteFileId,
    });

    if (result.status !== "ready") {
      const statusCode =
        result.status === "feature_disabled"
          ? 403
          : result.status === "google_not_connected"
            ? 409
            : result.status === "unsupported_format"
              ? 415
              : result.status === "not_found"
                ? 404
                : 500;
      return Response.json(result, { status: statusCode });
    }

    notifyDriveSaveComplete(userId, result.file?.name);

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save to Google Drive";
    recordGoogleAuthFailure(message, "google_drive_save");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isDriveCategoryId } from "@/lib/integrations/google/drive/categories";
import { uploadFileToGoogleDriveForUser } from "@/lib/integrations/google/drive/service";
import type { DriveCategoryId } from "@/lib/integrations/google/drive/types";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json(
      { status: "error", message: "multipart form data required" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { status: "error", message: "file is required" },
      { status: 400 },
    );
  }

  const parentIdRaw = form.get("parentId");
  const categoryRaw = form.get("category");
  const parentId =
    typeof parentIdRaw === "string" && parentIdRaw.trim()
      ? parentIdRaw.trim()
      : null;
  const category =
    typeof categoryRaw === "string" && isDriveCategoryId(categoryRaw)
      ? (categoryRaw as DriveCategoryId)
      : undefined;

  const context = await resolveFeatureAccessContext();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await uploadFileToGoogleDriveForUser({
      userId,
      context,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
      parentId,
      category,
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
      error instanceof Error ? error.message : "Failed to upload to Drive";
    recordGoogleAuthFailure(message, "google_drive_upload");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

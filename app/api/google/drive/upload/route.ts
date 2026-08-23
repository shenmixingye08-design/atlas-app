import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { isDriveCategoryId } from "@/lib/integrations/google/drive/categories";
import {
  respondGoogleDriveCaught,
  respondGoogleDriveResult,
} from "@/lib/integrations/google/drive/http";
import { uploadFileToGoogleDriveForUser } from "@/lib/integrations/google/drive/service";
import type { DriveCategoryId } from "@/lib/integrations/google/drive/types";

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
  // P0-05: bound memory — reject oversized uploads before buffering.
  const MAX_DRIVE_UPLOAD_BYTES = 20 * 1024 * 1024;
  if (typeof file.size === "number" && file.size > MAX_DRIVE_UPLOAD_BYTES) {
    return Response.json(
      { status: "error", message: "ファイルサイズが上限を超えています" },
      { status: 413 },
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_DRIVE_UPLOAD_BYTES) {
    return Response.json(
      { status: "error", message: "ファイルサイズが上限を超えています" },
      { status: 413 },
    );
  }

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

    return respondGoogleDriveResult(result);
  } catch (error) {
    return respondGoogleDriveCaught(
      error,
      "Google Driveへのアップロードに失敗しました",
      "google_drive_upload",
    );
  }
}

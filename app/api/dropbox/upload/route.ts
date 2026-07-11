import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { uploadDropboxFileForUser } from "@/lib/integrations/dropbox/service";
import { recordDropboxAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

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

  const parentPathRaw = form.get("parentPath");
  const parentPath =
    typeof parentPathRaw === "string" && parentPathRaw.trim()
      ? parentPathRaw.trim()
      : null;

  const context = await resolveFeatureAccessContext();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const result = await uploadDropboxFileForUser({
      userId,
      context,
      fileName: file.name,
      buffer,
      parentPath,
    });

    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload to Dropbox";
    recordDropboxAuthFailure(message, "dropbox_upload");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

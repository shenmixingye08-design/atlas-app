import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { uploadDropboxFileForUser } from "@/lib/integrations/dropbox/service";
import { recordDropboxAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

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
  // P0-05: bound memory — reject oversized uploads before buffering.
  const MAX_DROPBOX_UPLOAD_BYTES = 20 * 1024 * 1024;
  if (typeof file.size === "number" && file.size > MAX_DROPBOX_UPLOAD_BYTES) {
    return Response.json(
      { status: "error", message: "ファイルサイズが上限を超えています" },
      { status: 413 },
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_DROPBOX_UPLOAD_BYTES) {
    return Response.json(
      { status: "error", message: "ファイルサイズが上限を超えています" },
      { status: 413 },
    );
  }

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
      clientSafeMessage(error, "Failed to upload to Dropbox");
    recordDropboxAuthFailure(message, "dropbox_upload");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

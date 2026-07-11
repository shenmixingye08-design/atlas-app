import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { downloadGoogleDriveFileForUser } from "@/lib/integrations/google/drive/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

type Params = { params: Promise<{ fileId: string }> };

export async function GET(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { fileId } = await params;
  const context = await resolveFeatureAccessContext();

  try {
    const result = await downloadGoogleDriveFileForUser({
      userId,
      context,
      fileId,
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

    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to download Drive file";
    recordGoogleAuthFailure(message, "google_drive_download");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

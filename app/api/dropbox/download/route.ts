import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { downloadDropboxFileForUser } from "@/lib/integrations/dropbox/service";
import { recordDropboxAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const path = new URL(request.url).searchParams.get("path")?.trim();
  if (!path) {
    return Response.json(
      { status: "error", message: "path is required" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();

  try {
    const result = await downloadDropboxFileForUser({
      userId,
      context,
      path,
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
      error instanceof Error ? error.message : "Failed to download Dropbox file";
    recordDropboxAuthFailure(message, "dropbox_download");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

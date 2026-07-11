import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { getAttachmentBytesForUser } from "@/lib/integrations/google/gmail/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

type Params = {
  params: Promise<{ messageId: string; attachmentId: string }>;
};

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { messageId, attachmentId } = await params;
  const context = await resolveFeatureAccessContext();

  try {
    const result = await getAttachmentBytesForUser({
      userId,
      context,
      messageId,
      attachmentId,
    });
    if (result.status === "not_found") {
      return Response.json(result, { status: 404 });
    }
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }

    return new Response(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": result.meta.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.meta.filename)}`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to download attachment";
    recordGoogleAuthFailure(message, "google_gmail_attachment_download");
    return Response.json({ message }, { status: 500 });
  }
}

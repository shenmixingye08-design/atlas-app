import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { analyzePdfAttachmentForUser } from "@/lib/integrations/google/gmail/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

type Params = {
  params: Promise<{ messageId: string; attachmentId: string }>;
};

export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { messageId, attachmentId } = await params;
  const context = await resolveFeatureAccessContext();

  try {
    const result = await analyzePdfAttachmentForUser({
      userId,
      context,
      messageId,
      attachmentId,
    });

    if (result.status === "not_found") {
      return Response.json(result, { status: 404 });
    }
    if (result.status === "unsupported") {
      return Response.json(result, { status: 400 });
    }
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze PDF";
    recordGoogleAuthFailure(message, "google_gmail_pdf_analyze");
    return Response.json({ message: "PDF解析に失敗しました" }, { status: 500 });
  }
}

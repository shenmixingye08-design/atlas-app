import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { archiveMessageForUser } from "@/lib/integrations/google/gmail/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

type Params = { params: Promise<{ messageId: string }> };

export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await params;
  const context = await resolveFeatureAccessContext();

  try {
    const result = await archiveMessageForUser({ userId, context, messageId });
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to archive message";
    recordGoogleAuthFailure(message, "google_gmail_archive");
    return Response.json({ message: "アーカイブに失敗しました" }, { status: 500 });
  }
}

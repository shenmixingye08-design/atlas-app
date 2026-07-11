import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { addLabelToMessageForUser } from "@/lib/integrations/google/gmail/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

type Params = { params: Promise<{ messageId: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await params;
  const body = (await request.json().catch(() => null)) as {
    labelId?: unknown;
  } | null;
  const labelId = typeof body?.labelId === "string" ? body.labelId.trim() : "";
  if (!labelId) {
    return Response.json({ message: "labelId is required" }, { status: 400 });
  }

  const context = await resolveFeatureAccessContext();

  try {
    const result = await addLabelToMessageForUser({
      userId,
      context,
      messageId,
      labelId,
    });
    if (result.status === "not_found") {
      return Response.json(result, { status: 404 });
    }
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add label";
    recordGoogleAuthFailure(message, "google_gmail_add_label");
    return Response.json({ message: "ラベル追加に失敗しました" }, { status: 500 });
  }
}

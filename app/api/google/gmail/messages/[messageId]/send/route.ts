import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { sendReplyForUser } from "@/lib/integrations/google/gmail/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

type Params = { params: Promise<{ messageId: string }> };

export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await params;
  const body = (await request.json().catch(() => null)) as {
    subject?: unknown;
    to?: unknown;
    body?: unknown;
  } | null;

  if (
    typeof body?.subject !== "string" ||
    typeof body?.to !== "string" ||
    typeof body?.body !== "string"
  ) {
    return Response.json(
      { message: "subject, to, and body are required" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();

  try {
    const result = await sendReplyForUser({
      userId,
      context,
      messageId,
      draft: {
        messageId,
        subject: body.subject.trim(),
        to: body.to.trim(),
        body: body.body.trim(),
      },
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
      error instanceof Error ? error.message : "Failed to send Gmail reply";
    recordGoogleAuthFailure(message, "google_gmail_send");
    return Response.json({ message: "返信の送信に失敗しました" }, { status: 500 });
  }
}

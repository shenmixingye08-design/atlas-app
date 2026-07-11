import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { createGmailReplyDraft } from "@/lib/integrations/google/gmail/ai-assistant";
import { getGmailMessageForUser } from "@/lib/integrations/google/gmail/service";

type RouteContext = {
  params: Promise<{ messageId: string }>;
};

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { messageId } = await context.params;
  if (!messageId?.trim()) {
    return Response.json({ message: "messageId is required" }, { status: 400 });
  }

  const accessContext = await resolveFeatureAccessContext();

  const { requireBillingAiUsage } = await import("@/lib/billing/access");
  const usageDenied = await requireBillingAiUsage(userId);
  if (usageDenied) return usageDenied;

  const result = await getGmailMessageForUser({
    userId,
    messageId,
    context: accessContext,
  });

  if (result.status !== "ready") {
    const statusCode =
      result.status === "feature_disabled"
        ? 403
        : result.status === "google_not_connected"
          ? 409
          : result.status === "not_found"
            ? 404
            : 500;
    return Response.json(result, { status: statusCode });
  }

  try {
    const { runWithAiBillingUsage } = await import(
      "@/lib/billing/usage/request-context"
    );
    const draft = await runWithAiBillingUsage(
      {
        userId,
        api: "google_gmail",
        feature: "google_integration",
      },
      () => createGmailReplyDraft(result.message),
    );
    return Response.json({ draft });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create reply draft";
    return Response.json({ message }, { status: 500 });
  }
}

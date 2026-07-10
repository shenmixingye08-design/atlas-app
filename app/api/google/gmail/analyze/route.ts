import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  analyzeGmailMessages,
  extractImportantMessages,
} from "@/lib/integrations/google/gmail/ai-assistant";
import { getGmailMessageForUser } from "@/lib/integrations/google/gmail/service";
import { notifyGmailSummaryComplete } from "@/lib/notifications/emitters";

type RequestBody = {
  messageIds?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.messageIds) || body.messageIds.length === 0) {
    return Response.json(
      { message: "messageIds must be a non-empty array" },
      { status: 400 },
    );
  }

  const messageIds = body.messageIds.filter(
    (id): id is string => typeof id === "string" && id.trim().length > 0,
  );

  if (messageIds.length === 0) {
    return Response.json(
      { message: "messageIds must contain valid strings" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();

  try {
    const messages = [];
    for (const messageId of messageIds.slice(0, 20)) {
      const result = await getGmailMessageForUser({
        userId,
        messageId,
        context,
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

      messages.push(result.message);
    }

    const analyses = await analyzeGmailMessages(messages);
    const important = extractImportantMessages(analyses);

    notifyGmailSummaryComplete(userId);

    return Response.json({ analyses, important });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze Gmail messages";
    return Response.json({ message }, { status: 500 });
  }
}

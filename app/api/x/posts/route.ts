import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import type { XPostMode } from "@/lib/integrations/x/post/types";
import {
  postTweetAutoForUser,
  postTweetNowForUser,
  postTweetTestForUser,
  saveXDraftForUser,
  scheduleTweetForUser,
} from "@/lib/integrations/x/post/service";
import { recordXPostFailure } from "@/lib/owner/error-monitoring/telemetry";

type RequestBody = {
  text?: unknown;
  mode?: unknown;
  scheduledFor?: unknown;
  automationId?: unknown;
  draftId?: unknown;
};

function parsePostMode(value: unknown): XPostMode | null {
  return value === "immediate" ||
    value === "scheduled" ||
    value === "auto" ||
    value === "test" ||
    value === "draft"
    ? value
    : null;
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json(
      { status: "error", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const mode = parsePostMode(body.mode) ?? "immediate";

  // Test mode may omit custom text (server generates a verification tweet).
  if (mode !== "test" && (typeof body.text !== "string" || !body.text.trim())) {
    return Response.json(
      { status: "error", message: "text is required" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();

  const { requireBillingFeature, requireBillingSnsPost } = await import(
    "@/lib/billing/access"
  );

  // Drafts do not consume SNS post quota or call X API.
  if (mode !== "draft") {
    const snsFeature =
      mode === "immediate" || mode === "test"
        ? ("sns_assist" as const)
        : ("sns_auto_post" as const);
    const featureDenied = await requireBillingFeature(userId, snsFeature);
    if (featureDenied) return featureDenied;
    const snsLimitDenied = await requireBillingSnsPost(userId);
    if (snsLimitDenied) return snsLimitDenied;
  }

  const automationId =
    typeof body.automationId === "string" && body.automationId.trim()
      ? body.automationId.trim()
      : null;

  const text =
    typeof body.text === "string" ? body.text : "";

  try {
    if (mode === "draft") {
      const draftId =
        typeof body.draftId === "string" && body.draftId.trim()
          ? body.draftId.trim()
          : undefined;
      const result = await saveXDraftForUser({
        userId,
        text,
        draftId,
        context,
      });
      return mapPostResult(result);
    }

    if (mode === "test") {
      const result = await postTweetTestForUser({
        userId,
        text: text.trim() || undefined,
        context,
      });
      return mapPostResult(result);
    }

    if (mode === "scheduled") {
      if (typeof body.scheduledFor !== "string" || !body.scheduledFor.trim()) {
        return Response.json(
          {
            status: "error",
            message: "scheduledFor is required for scheduled posts",
          },
          { status: 400 },
        );
      }

      const result = await scheduleTweetForUser({
        userId,
        text,
        scheduledFor: body.scheduledFor.trim(),
        context,
        automationId,
      });

      return mapPostResult(result);
    }

    if (mode === "auto") {
      const result = await postTweetAutoForUser({
        userId,
        text,
        context,
        automationId,
      });
      return mapPostResult(result);
    }

    const result = await postTweetNowForUser({
      userId,
      text,
      context,
    });
    return mapPostResult(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to post to X";
    recordXPostFailure(message, "x_post_api");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}

function mapPostResult(
  result: Awaited<ReturnType<typeof postTweetNowForUser>>,
): Response {
  if (result.status === "feature_disabled") {
    return Response.json(result, { status: 403 });
  }
  if (result.status === "x_not_connected") {
    return Response.json(result, { status: 409 });
  }
  if (result.status === "validation_failed") {
    return Response.json(result, { status: 422 });
  }
  if (result.status === "error") {
    return Response.json(result, { status: 502 });
  }
  return Response.json(result);
}

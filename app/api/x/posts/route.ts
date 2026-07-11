import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import type { XPostMode } from "@/lib/integrations/x/post/types";
import {
  postTweetAutoForUser,
  postTweetNowForUser,
  scheduleTweetForUser,
} from "@/lib/integrations/x/post/service";
import { recordXPostFailure } from "@/lib/owner/error-monitoring/telemetry";

type RequestBody = {
  text?: unknown;
  mode?: unknown;
  scheduledFor?: unknown;
  automationId?: unknown;
};

function parsePostMode(value: unknown): XPostMode | null {
  return value === "immediate" ||
    value === "scheduled" ||
    value === "auto"
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

  if (typeof body.text !== "string" || !body.text.trim()) {
    return Response.json(
      { status: "error", message: "text is required" },
      { status: 400 },
    );
  }

  const mode = parsePostMode(body.mode) ?? "immediate";
  const context = await resolveFeatureAccessContext();

  const { requireBillingFeature, requireBillingSnsPost } = await import(
    "@/lib/billing/access"
  );
  const snsFeature =
    mode === "immediate" ? ("sns_assist" as const) : ("sns_auto_post" as const);
  const featureDenied = await requireBillingFeature(userId, snsFeature);
  if (featureDenied) return featureDenied;
  const snsLimitDenied = await requireBillingSnsPost(userId);
  if (snsLimitDenied) return snsLimitDenied;

  const automationId =
    typeof body.automationId === "string" && body.automationId.trim()
      ? body.automationId.trim()
      : null;

  try {
    if (mode === "scheduled") {
      if (typeof body.scheduledFor !== "string" || !body.scheduledFor.trim()) {
        return Response.json(
          { status: "error", message: "scheduledFor is required for scheduled posts" },
          { status: 400 },
        );
      }

      const result = await scheduleTweetForUser({
        userId,
        text: body.text,
        scheduledFor: body.scheduledFor.trim(),
        context,
        automationId,
      });

      return mapPostResult(result);
    }

    if (mode === "auto") {
      const result = await postTweetAutoForUser({
        userId,
        text: body.text,
        context,
        automationId,
      });
      return mapPostResult(result);
    }

    const result = await postTweetNowForUser({
      userId,
      text: body.text,
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

function mapPostResult(result: Awaited<ReturnType<typeof postTweetNowForUser>>): Response {
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

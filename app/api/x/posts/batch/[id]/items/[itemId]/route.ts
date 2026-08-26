import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";
import { mapXPostBatchResult } from "@/lib/integrations/x/post/batch-http";
import {
  deleteOwnedXPostBatchItem,
  editOwnedXPostBatchItem,
  regenerateOwnedXPostBatchItem,
  setOwnedXPostBatchItemApproval,
} from "@/lib/integrations/x/post/batch-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "ログインしてください。" },
      { status: 401 },
    );
  }
  const { id, itemId } = await context.params;
  let body: {
    text?: unknown;
    scheduledFor?: unknown;
    approved?: unknown;
    regenerate?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { status: "validation_failed", message: "入力内容を確認してください。" },
      { status: 400 },
    );
  }

  if (body.regenerate === true) {
    const { requireBillingFeature, requireAndConsumeAiJob } = await import(
      "@/lib/billing/access"
    );
    const featureDenied = await requireBillingFeature(userId, "sns_auto_post");
    if (featureDenied) return featureDenied;
    const aiDenied = await requireAndConsumeAiJob(
      userId,
      "x_post_batch",
      `regen:${itemId}`,
    );
    if (aiDenied) return aiDenied;
    const rateLimited = await enforceAiRateLimit(userId);
    if (rateLimited) return rateLimited;
    const result = await regenerateOwnedXPostBatchItem({
      ownerId: userId,
      batchId: id,
      itemId,
    });
    return mapXPostBatchResult(result);
  }

  if (typeof body.approved === "boolean") {
    const contextAccess = await resolveFeatureAccessContext();
    const result = await setOwnedXPostBatchItemApproval({
      ownerId: userId,
      batchId: id,
      itemId,
      approved: body.approved,
      context: contextAccess,
    });
    return mapXPostBatchResult(result);
  }

  const result = await editOwnedXPostBatchItem({
    ownerId: userId,
    batchId: id,
    itemId,
    text: typeof body.text === "string" ? body.text : undefined,
    scheduledFor:
      body.scheduledFor === null
        ? null
        : typeof body.scheduledFor === "string"
          ? body.scheduledFor
          : undefined,
  });
  return mapXPostBatchResult(result);
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "ログインしてください。" },
      { status: 401 },
    );
  }
  const { id, itemId } = await context.params;
  const result = await deleteOwnedXPostBatchItem({
    ownerId: userId,
    batchId: id,
    itemId,
  });
  return mapXPostBatchResult(result);
}

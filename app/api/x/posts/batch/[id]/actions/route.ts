import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";
import { mapXPostBatchResult } from "@/lib/integrations/x/post/batch-http";
import {
  approveAllOwnedXPostBatch,
  cancelOwnedXPostBatch,
  deleteSelectedOwnedItems,
  redistributeOwnedXPostBatch,
  regenerateSelectedOwnedItems,
  retryFailedOwnedXPostBatch,
} from "@/lib/integrations/x/post/batch-service";
import type { XPostBatchAction } from "@/lib/integrations/x/post/batch-types";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

function parseAction(value: unknown): XPostBatchAction | null {
  return value === "approve_all" ||
    value === "regenerate_selected" ||
    value === "delete_selected" ||
    value === "redistribute" ||
    value === "retry_failed" ||
    value === "cancel"
    ? value
    : null;
}

export async function POST(
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
  const { id } = await context.params;
  let body: { action?: unknown; itemIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { status: "validation_failed", message: "入力内容を確認してください。" },
      { status: 400 },
    );
  }

  const action = parseAction(body.action);
  if (!action) {
    return Response.json(
      { status: "validation_failed", message: "操作を確認してください。" },
      { status: 422 },
    );
  }

  const itemIds = Array.isArray(body.itemIds)
    ? body.itemIds.filter((value): value is string => typeof value === "string")
    : [];
  const access = await resolveFeatureAccessContext();

  if (action === "regenerate_selected" || action === "retry_failed") {
    const { requireBillingFeature, requireAndConsumeAiJob } = await import(
      "@/lib/billing/access"
    );
    const featureDenied = await requireBillingFeature(userId, "sns_auto_post");
    if (featureDenied) return featureDenied;
    const aiDenied = await requireAndConsumeAiJob(
      userId,
      "x_post_batch",
      `${action}:${id}`,
    );
    if (aiDenied) return aiDenied;
    const rateLimited = await enforceAiRateLimit(userId);
    if (rateLimited) return rateLimited;
  }

  if (action === "approve_all") {
    return mapXPostBatchResult(
      await approveAllOwnedXPostBatch({
        ownerId: userId,
        batchId: id,
        context: access,
      }),
    );
  }
  if (action === "regenerate_selected") {
    return mapXPostBatchResult(
      await regenerateSelectedOwnedItems({
        ownerId: userId,
        batchId: id,
        itemIds,
      }),
    );
  }
  if (action === "delete_selected") {
    return mapXPostBatchResult(
      await deleteSelectedOwnedItems({
        ownerId: userId,
        batchId: id,
        itemIds,
      }),
    );
  }
  if (action === "redistribute") {
    return mapXPostBatchResult(
      await redistributeOwnedXPostBatch({
        ownerId: userId,
        batchId: id,
        context: access,
      }),
    );
  }
  if (action === "retry_failed") {
    return mapXPostBatchResult(
      await retryFailedOwnedXPostBatch({
        ownerId: userId,
        batchId: id,
        context: access,
        signal: request.signal,
      }),
    );
  }
  return mapXPostBatchResult(
    await cancelOwnedXPostBatch({ ownerId: userId, batchId: id }),
  );
}

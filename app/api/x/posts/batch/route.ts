import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";
import { consumeDistributedRateLimit } from "@/lib/http/rate-limit";
import { mapXPostBatchResult } from "@/lib/integrations/x/post/batch-http";
import {
  createAndGenerateXPostBatch,
  listOwnedXPostBatches,
  parseXPostBatchInput,
} from "@/lib/integrations/x/post/batch-service";
import { X_POST_BATCH_RATE_LIMIT } from "@/lib/integrations/x/post/batch-config";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "ログインしてください。" },
      { status: 401 },
    );
  }
  const batches = await listOwnedXPostBatches({ ownerId: userId });
  return Response.json({ status: "ready", batches });
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "ログインしてください。" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "validation_failed", message: "入力内容を確認してください。" },
      { status: 400 },
    );
  }

  const parsed = parseXPostBatchInput(body);
  if (!parsed.input) {
    return Response.json(
      {
        status: "validation_failed",
        message: parsed.error ?? "入力内容を確認してください。",
      },
      { status: 422 },
    );
  }

  const { requireBillingFeature, requireAndConsumeAiJob } = await import(
    "@/lib/billing/access"
  );
  const featureDenied = await requireBillingFeature(userId, "sns_auto_post");
  if (featureDenied) return featureDenied;
  const aiDenied = await requireAndConsumeAiJob(
    userId,
    "x_post_batch",
    `create:${Date.now()}`,
  );
  if (aiDenied) return aiDenied;

  const rateLimited = await enforceAiRateLimit(userId);
  if (rateLimited) return rateLimited;
  const batchLimit = await consumeDistributedRateLimit(
    userId,
    X_POST_BATCH_RATE_LIMIT,
  );
  if (!batchLimit.allowed) {
    return Response.json(
      {
        status: "rate_limited",
        message: "まとめて作成の実行回数が多いため、少し時間をおいてください。",
      },
      { status: 429 },
    );
  }

  const context = await resolveFeatureAccessContext();
  const result = await createAndGenerateXPostBatch({
    ownerId: userId,
    body: parsed.input,
    context,
    signal: request.signal,
  });
  return mapXPostBatchResult(result);
}

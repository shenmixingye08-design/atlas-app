import { auth } from "@clerk/nextjs/server";

import { runWithAiBillingUsage } from "@/lib/billing/usage/request-context";
import { enforceAiRateLimit } from "@/lib/http/enforce-ai-rate-limit";
import { clientSafeMessage } from "@/lib/security/client-safe-message";
import { safeLog } from "@/lib/security/redact";
import { isVisionDetectedType } from "@/lib/vision/schemas";
import { analyzeUserImageBatch } from "@/lib/vision/analyze-batch";
import { labelForDetectedType } from "@/lib/vision/classify";
import { logVisionPipeline } from "@/lib/vision/pipeline-log";
import { VisionError } from "@/lib/vision/types";
import { userMessageForVisionFailure } from "@/lib/vision/user-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = {
  attachmentIds?: unknown;
  userText?: unknown;
  detectedType?: unknown;
  forceRefresh?: unknown;
  ecoMode?: unknown;
  jobId?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceAiRateLimit(userId);
  if (limited) return limited;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];

  if (attachmentIds.length === 0) {
    return Response.json(
      { error: "attachmentIds が必要です", code: "not_found" },
      { status: 400 },
    );
  }

  const userText =
    typeof body.userText === "string" ? body.userText : "";
  const overrideType =
    typeof body.detectedType === "string" && isVisionDetectedType(body.detectedType)
      ? body.detectedType
      : undefined;

  try {
    const batch = await runWithAiBillingUsage(
      {
        userId,
        api: "other",
        feature: "vision_analyze",
        suppressAutoRecord: true,
      },
      () =>
        analyzeUserImageBatch({
          userId,
          attachmentIds,
          userText,
          overrideType,
          forceRefresh: body.forceRefresh === true,
          ecoMode: body.ecoMode === true,
          jobId: typeof body.jobId === "string" ? body.jobId : null,
        }),
    );

    const primary = batch.images[0];
    const responseBody = {
      batch: {
        id: batch.id,
        status: batch.status,
        combinedSummary: batch.combinedSummary,
        recommendedArtifactType: batch.recommendedArtifactType,
        warnings: batch.warnings,
        needsInput: batch.needsInput,
        detailLevel: batch.detailLevel,
        model: batch.model,
        createdAt: batch.createdAt,
        images: batch.images.map((image) => ({
          id: image.id,
          attachmentId: image.attachmentId,
          detectedType: image.detectedType,
          label: labelForDetectedType(image.detectedType),
          confidence: image.confidence,
          summary: image.summary,
          missingFields: image.missingFields,
          warnings: image.warnings,
          artifactSuggestions: image.artifactSuggestions,
          cached: image.cached === true,
        })),
      },
      label: primary ? labelForDetectedType(primary.detectedType) : null,
    };
    logVisionPipeline({
      stage: "return_to_frontend",
      ok: batch.status !== "failed",
      attachmentIds,
      attachmentId: primary?.attachmentId ?? null,
      outputTextPreview: batch.combinedSummary?.slice(0, 120) ?? null,
      jobId: typeof body.jobId === "string" ? body.jobId : null,
    });
    return Response.json(responseBody);
  } catch (error) {
    if (error instanceof VisionError) {
      const status =
        error.code === "rate_limited"
          ? 429
          : error.code === "not_found" || error.code === "forbidden"
            ? 404
            : 422;
      const details = error.details ?? null;
      const openaiCode =
        typeof details?.openaiErrorCode === "string"
          ? details.openaiErrorCode
          : null;
      const publicMessage = userMessageForVisionFailure({
        code: error.code,
        failedStage: error.failedStage,
        openaiCode,
        openaiMessage:
          typeof details?.safeMessage === "string"
            ? details.safeMessage
            : null,
        httpStatus:
          typeof details?.httpStatus === "number" ? details.httpStatus : null,
      });

      // Server-only: never log rawErrorBody / provider payload.
      safeLog("error", "[vision] analyze VisionError", {
        code: error.code,
        diagnosticId: error.diagnosticId,
        failedStage: error.failedStage,
        openaiErrorCode: openaiCode,
        httpStatus: details?.httpStatus ?? null,
      });
      logVisionPipeline({
        stage: "return_to_frontend",
        ok: false,
        diagnosticId: error.diagnosticId ?? null,
        attachmentIds,
        dropReason: error.code,
        openAiErrorCode: openaiCode,
        openAiErrorMessage: publicMessage.slice(0, 200),
      });

      // P0-04: public body — code + diagnosticId only; no rawErrorBody/details/cause/stack.
      return Response.json(
        {
          error: publicMessage,
          code: error.code,
          diagnosticId: error.diagnosticId ?? null,
          failedStage: error.failedStage ?? null,
          openai: {
            code: openaiCode,
          },
        },
        { status },
      );
    }
    const message = clientSafeMessage(
      error,
      "画像処理に失敗しました。内容を確認して再試行してください。",
    );
    safeLog("error", "[vision] analyze failed", {
      name: error instanceof Error ? error.name : typeof error,
      message,
    });
    return Response.json(
      {
        error: message,
        code: "openai_failed",
        diagnosticId: null,
      },
      { status: 500 },
    );
  }
}

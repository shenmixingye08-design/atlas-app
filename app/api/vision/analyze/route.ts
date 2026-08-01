import { auth } from "@clerk/nextjs/server";

import { runWithAiBillingUsage } from "@/lib/billing/usage/request-context";
import { isVisionDetectedType } from "@/lib/vision/schemas";
import { analyzeUserImageBatch } from "@/lib/vision/analyze-batch";
import { logVisionPipeline } from "@/lib/vision/pipeline-log";
import { VisionError } from "@/lib/vision/types";
import { labelForDetectedType } from "@/lib/vision/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Align with vision job budget (≥120s). Prefer /api/work/jobs for UI flows. */
export const maxDuration = 180;

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
      console.error("[vision] analyze VisionError", {
        code: error.code,
        message: error.message,
        diagnosticId: error.diagnosticId,
        failedStage: error.failedStage,
        details,
      });
      logVisionPipeline({
        stage: "return_to_frontend",
        ok: false,
        diagnosticId: error.diagnosticId ?? null,
        attachmentIds,
        dropReason: error.code,
        openAiErrorCode:
          typeof details?.openaiErrorCode === "string"
            ? details.openaiErrorCode
            : null,
        openAiErrorMessage: error.message.slice(0, 200),
      });
      return Response.json(
        {
          error: error.message,
          code: error.code,
          diagnosticId: error.diagnosticId,
          failedStage: error.failedStage,
          cause: error.message,
          openai: details
            ? {
                status: details.httpStatus ?? null,
                type: details.openaiErrorType ?? null,
                code: details.openaiErrorCode ?? null,
                message: details.safeMessage ?? error.message,
                request_id: details.requestId ?? null,
                rawErrorBody: details.rawErrorBody ?? null,
              }
            : null,
          details,
        },
        { status },
      );
    }
    const message =
      error instanceof Error ? error.message : "unknown_vision_analyze_error";
    console.error("[vision] analyze failed", {
      message,
      name: error instanceof Error ? error.name : typeof error,
    });
    return Response.json(
      {
        error: message,
        code: "openai_failed",
        cause: message,
        openai: {
          status: null,
          type: error instanceof Error ? error.name : "unknown",
          code: "unhandled_exception",
          message,
          request_id: null,
          rawErrorBody: null,
        },
      },
      { status: 500 },
    );
  }
}

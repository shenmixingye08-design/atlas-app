import "server-only";

import { analyzeUserImageBatch } from "@/lib/vision/analyze-batch";
import { buildVisionEnrichedAssignment } from "@/lib/vision/adapters/to-assignment-context";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import { completeImageWorkToDeliverables } from "@/lib/vision/complete-image-work";
import {
  evaluateVisionBatchGate,
  stripVisionPoisonText,
} from "@/lib/vision/gate";
import {
  appendVisionDiagnosticStage,
  createVisionDiagnostic,
  getLatestFailedStage,
  getVisionDiagnosticForUser,
} from "@/lib/vision/diagnostics";
import {
  formatVisionDeveloperHint,
  isVisionPipelineStage,
  labelForVisionStage,
  messageForVisionStage,
  stageFromVisionErrorCode,
  type VisionPipelineStage,
} from "@/lib/vision/failure-stage";
import { isVisionDetectedType } from "@/lib/vision/schemas";
import type {
  VisionBatchResult,
  VisionDetectedType,
  VisionGatePayload,
} from "@/lib/vision/types";
import { VisionError } from "@/lib/vision/types";
import { readEffectiveCostSavingMode } from "@/lib/cost-optimization/metadata";

export type VisionPrepareResult = {
  assignment: string;
  metadata: Record<string, unknown>;
  batch: VisionBatchResult | null;
  skipped: boolean;
  /** When set, commander must NOT run Artifact Engine / orchestration. */
  gate?: VisionGatePayload;
};

function readAttachmentIds(metadata: Readonly<Record<string, unknown>> | undefined): string[] {
  const raw = metadata?.attachmentIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function readOverrideType(
  metadata: Readonly<Record<string, unknown>> | undefined,
): VisionDetectedType | undefined {
  const raw = metadata?.visionDetectedType;
  if (typeof raw === "string" && isVisionDetectedType(raw)) return raw;
  return undefined;
}

function buildUserGateMessage(input: {
  failedStage: VisionPipelineStage;
  status: VisionGatePayload["status"];
  fallback?: string;
}): string {
  if (input.status === "needs_input") {
    return input.fallback ?? "画像内に該当情報を確認できませんでした";
  }
  if (input.status === "config_missing") {
    return input.fallback ?? "画像解析の設定が不足しています";
  }
  const stageLabel = labelForVisionStage(input.failedStage);
  const stageMessage = messageForVisionStage(input.failedStage);
  return `【${stageLabel}で失敗】${stageMessage}`;
}

function toGatePayload(input: {
  status: VisionGatePayload["status"];
  userCode: string;
  analysisSuccess: boolean;
  diagnosticId?: string | null;
  failedStage?: VisionPipelineStage | null;
  developerCode?: string | null;
  messageOverride?: string;
}): VisionGatePayload {
  const failedStage = input.failedStage ?? "vision_response";
  const message =
    input.messageOverride ??
    buildUserGateMessage({
      failedStage,
      status: input.status,
    });
  return {
    status: input.status,
    analysisSuccess: input.analysisSuccess,
    message,
    userCode: input.userCode,
    diagnosticId: input.diagnosticId ?? null,
    failedStage,
    failedStageLabel: labelForVisionStage(failedStage),
    developerCode: input.developerCode ?? null,
  };
}

function mapVisionErrorToGate(
  error: unknown,
  fallbackDiagnosticId?: string | null,
): VisionGatePayload {
  if (error instanceof VisionError) {
    const diagnosticId = error.diagnosticId ?? fallbackDiagnosticId ?? null;
    const failedStage: VisionPipelineStage =
      (error.failedStage && isVisionPipelineStage(error.failedStage)
        ? error.failedStage
        : null) ?? stageFromVisionErrorCode(error.code);

    if (diagnosticId) {
      appendVisionDiagnosticStage(diagnosticId, failedStage, false, {
        errorCode: error.code,
        userCode:
          error.code === "config_missing"
            ? "config_missing"
            : error.code === "openai_failed" ||
                error.code === "timeout" ||
                error.code === "rate_limited"
              ? "ai_analyze_failed"
              : error.code === "json_parse_failed"
                ? "schema_failed"
                : "image_analyze_failed",
        analysisSuccess: false,
      });
    }

    if (error.code === "config_missing") {
      return toGatePayload({
        status: "config_missing",
        userCode: "config_missing",
        analysisSuccess: false,
        diagnosticId,
        failedStage: "vision_request",
        developerCode: error.code,
        messageOverride: error.message,
      });
    }
    if (
      error.code === "storage_failed" ||
      error.code === "empty_image" ||
      error.code === "not_found"
    ) {
      return toGatePayload({
        status: "needs_image_retry",
        userCode: "image_fetch_failed",
        analysisSuccess: false,
        diagnosticId,
        failedStage,
        developerCode: error.code,
      });
    }
    if (error.code === "unsupported_type" || error.code === "invalid_data_url") {
      return toGatePayload({
        status: "needs_image_retry",
        userCode: "image_format_invalid",
        analysisSuccess: false,
        diagnosticId,
        failedStage,
        developerCode: error.code,
      });
    }
    if (error.code === "json_parse_failed" || error.code === "table_extract_failed") {
      return toGatePayload({
        status: "vision_failed",
        userCode: "schema_failed",
        analysisSuccess: false,
        diagnosticId,
        failedStage: "schema_validation",
        developerCode: error.code,
      });
    }
    if (
      error.code === "openai_failed" ||
      error.code === "timeout" ||
      error.code === "rate_limited"
    ) {
      return toGatePayload({
        status: "vision_failed",
        userCode: "ai_analyze_failed",
        analysisSuccess: false,
        diagnosticId,
        failedStage: "vision_response",
        developerCode: error.code,
      });
    }
    if (error.code === "artifact_failed") {
      return toGatePayload({
        status: "vision_failed",
        userCode: "artifact_failed",
        analysisSuccess: true,
        diagnosticId,
        failedStage: "artifact_generation",
        developerCode: error.code,
      });
    }
    return toGatePayload({
      status: "vision_failed",
      userCode: "image_analyze_failed",
      analysisSuccess: false,
      diagnosticId,
      failedStage,
      developerCode: error.code,
    });
  }

  const message = error instanceof Error ? error.message : "";
  if (/supabase|SERVICE_ROLE|設定が不足/i.test(message)) {
    return toGatePayload({
      status: "config_missing",
      userCode: "config_missing",
      analysisSuccess: false,
      diagnosticId: fallbackDiagnosticId,
      failedStage: "storage_save",
      developerCode: "config_missing",
      messageOverride: "画像保存の設定が不足しています",
    });
  }
  return toGatePayload({
    status: "vision_failed",
    userCode: "image_analyze_failed",
    analysisSuccess: false,
    diagnosticId: fallbackDiagnosticId,
    failedStage: "vision_response",
    developerCode: "unknown",
  });
}

function enrichGateFromDiagnostic(
  gate: VisionGatePayload,
  userId: string,
): VisionGatePayload {
  if (!gate.diagnosticId) return gate;
  const record = getVisionDiagnosticForUser(userId, gate.diagnosticId);
  if (!record) return gate;
  const failedStage = getLatestFailedStage(record) ?? gate.failedStage;
  if (!failedStage || !isVisionPipelineStage(failedStage)) return gate;
  return {
    ...gate,
    failedStage,
    failedStageLabel: labelForVisionStage(failedStage),
    developerCode: gate.developerCode ?? record.lastErrorCode,
    message:
      gate.status === "needs_input" || gate.status === "config_missing"
        ? gate.message
        : buildUserGateMessage({ failedStage, status: gate.status }),
  };
}

/**
 * If metadata.attachmentIds is present, run vision analysis and enrich assignment.
 * On any vision failure / hard needs_input, returns `gate` and must block artifact generation.
 */
export async function prepareAssignmentWithVision(input: {
  userId: string;
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
  forceRefresh?: boolean;
}): Promise<VisionPrepareResult> {
  const cleanAssignment = stripVisionPoisonText(input.assignment);
  const attachmentIds = readAttachmentIds(input.metadata);
  const diagnosticId = createVisionDiagnostic({
    userId: input.userId,
    attachmentId: attachmentIds[0] ?? null,
    jobId: typeof input.metadata?.jobId === "string" ? input.metadata.jobId : null,
  }).id;
  appendVisionDiagnosticStage(diagnosticId, "upload", attachmentIds.length > 0, {
    payloadAttachmentIdCount: attachmentIds.length,
  });

  if (attachmentIds.length === 0) {
    appendVisionDiagnosticStage(diagnosticId, "blocked", false, {
      artifactGate: "missing_attachment_ids",
      analysisSuccess: false,
    });
    return {
      assignment: cleanAssignment,
      metadata: { ...(input.metadata ?? {}) },
      batch: null,
      skipped: true,
    };
  }

  const existing = input.metadata?.visionBatch;
  if (
    existing &&
    typeof existing === "object" &&
    !input.forceRefresh &&
    input.metadata?.visionReuse === true
  ) {
    const batch = existing as VisionBatchResult;
    const gate = evaluateVisionBatchGate({
      batch,
      userText: cleanAssignment,
    });
    if (gate.status !== "ok") {
      return {
        assignment: cleanAssignment,
        metadata: {
          ...(input.metadata ?? {}),
          visionStatus: gate.status,
          visionAnalysisSuccess: gate.analysisSuccess,
          visionDiagnosticId: diagnosticId,
        },
        batch,
        skipped: false,
        gate: toGatePayload({
          status: gate.status === "needs_input" ? "needs_input" : "vision_failed",
          userCode: gate.userCode,
          analysisSuccess: gate.analysisSuccess,
          diagnosticId,
          failedStage: "blocked",
          developerCode: gate.userCode,
          messageOverride: gate.message,
        }),
      };
    }
    return {
      assignment: buildVisionEnrichedAssignment({
        assignment: cleanAssignment,
        batch,
      }),
      metadata: {
        ...(input.metadata ?? {}),
        visionStatus: batch.status,
        visionAnalysisSuccess: true,
        visionDeliverableSeed: visionBatchToDeliverableContent(batch),
        visionDiagnosticId: diagnosticId,
      },
      batch,
      skipped: false,
    };
  }

  try {
    const ecoMode = readEffectiveCostSavingMode(input.metadata) === "low";
    const batch = await analyzeUserImageBatch({
      userId: input.userId,
      attachmentIds,
      userText: cleanAssignment,
      overrideType: readOverrideType(input.metadata),
      ecoMode,
      forceRefresh:
        input.forceRefresh === true || input.metadata?.forceVisionRefresh === true,
      jobId: typeof input.metadata?.jobId === "string" ? input.metadata.jobId : null,
      diagnosticId,
    });

    const gate = evaluateVisionBatchGate({
      batch,
      userText: cleanAssignment,
    });

    const batchDiagnosticId =
      typeof batch.commonFields.diagnosticId === "string"
        ? batch.commonFields.diagnosticId
        : diagnosticId;

    if (gate.status !== "ok") {
      appendVisionDiagnosticStage(batchDiagnosticId, "blocked", false, {
        artifactGate: gate.status,
        analysisSuccess: gate.analysisSuccess,
        userCode: gate.userCode,
        detectedType:
          typeof batch.commonFields.detectedType === "string"
            ? batch.commonFields.detectedType
            : null,
        payloadAttachmentIdCount: attachmentIds.length,
      });
      return {
        assignment: cleanAssignment,
        metadata: {
          ...(input.metadata ?? {}),
          attachmentIds,
          visionStatus: gate.status,
          visionAnalysisSuccess: gate.analysisSuccess,
          visionNeedsInput: batch.needsInput ?? null,
          visionWarnings: batch.warnings,
          visionBatchId: batch.id,
          visionDiagnosticId: batchDiagnosticId,
          visionFailedStage: "blocked",
          visionDeveloperHint: formatVisionDeveloperHint({
            diagnosticId: batchDiagnosticId,
            failedStage: "blocked",
            userCode: gate.userCode,
          }),
        },
        batch,
        skipped: false,
        gate: enrichGateFromDiagnostic(
          toGatePayload({
            status: gate.status === "needs_input" ? "needs_input" : "vision_failed",
            userCode: gate.userCode,
            analysisSuccess: gate.analysisSuccess,
            diagnosticId: batchDiagnosticId,
            failedStage: "blocked",
            developerCode: gate.userCode,
            messageOverride: gate.message,
          }),
          input.userId,
        ),
      };
    }

    appendVisionDiagnosticStage(batchDiagnosticId, "artifact_handoff", true, {
      artifactGate: "ok",
      analysisSuccess: true,
      detectedType:
        typeof batch.commonFields.detectedType === "string"
          ? batch.commonFields.detectedType
          : null,
      payloadAttachmentIdCount: attachmentIds.length,
    });

    const enriched = buildVisionEnrichedAssignment({
      assignment: cleanAssignment,
      batch,
    });

    // Generate real Word/PDF/Excel from understood image content (not OCR-only).
    let visionFiles: Awaited<
      ReturnType<typeof completeImageWorkToDeliverables>
    > | null = null;
    try {
      appendVisionDiagnosticStage(batchDiagnosticId, "artifact_generation", true, {
        artifactGate: "generating",
        analysisSuccess: true,
      });
      visionFiles = await completeImageWorkToDeliverables({
        userId: input.userId,
        assignment: cleanAssignment,
        batch,
        jobId:
          typeof input.metadata?.jobId === "string"
            ? input.metadata.jobId
            : typeof input.metadata?.workJobId === "string"
              ? input.metadata.workJobId
              : null,
      });
      const saveOk = Boolean(visionFiles.downloadable && visionFiles.ok);
      appendVisionDiagnosticStage(
        batchDiagnosticId,
        "artifact_generation",
        visionFiles.deliverables.length > 0,
        {
          artifactGate: visionFiles.ok
            ? "deliverables_ok"
            : visionFiles.deliverables.length > 0
              ? "deliverables_partial"
              : "deliverables_empty",
          analysisSuccess: true,
          payloadAttachmentIdCount: attachmentIds.length,
        },
      );
      appendVisionDiagnosticStage(batchDiagnosticId, "deliverable_save", saveOk, {
        artifactGate: saveOk ? "saved" : "save_incomplete",
        analysisSuccess: true,
        errorCode: saveOk ? null : "deliverable_save_failed",
      });
    } catch (error) {
      appendVisionDiagnosticStage(batchDiagnosticId, "artifact_generation", false, {
        artifactGate: "deliverables_failed",
        analysisSuccess: true,
        payloadAttachmentIdCount: attachmentIds.length,
        errorCode: "artifact_failed",
        userCode: "artifact_failed",
        error:
          error instanceof Error ? error.message.slice(0, 200) : "deliverable_error",
      });
    }

    return {
      assignment: enriched,
      metadata: {
        ...(input.metadata ?? {}),
        attachmentIds,
        visionBatchId: batch.id,
        visionStatus: "analyzed",
        visionAnalysisSuccess: true,
        visionDiagnosticId: batchDiagnosticId,
        visionDetectedType: batch.commonFields.detectedType,
        visionLabel:
          typeof batch.images[0]?.detectedType === "string"
            ? batch.images[0]?.detectedType
            : "unknown",
        visionNeedsInput: batch.needsInput ?? null,
        visionWarnings: batch.warnings,
        visionBatch: {
          id: batch.id,
          status: batch.status,
          combinedSummary: batch.combinedSummary,
          recommendedArtifactType: batch.recommendedArtifactType,
          warnings: batch.warnings,
          needsInput: batch.needsInput,
          images: batch.images.map((image) => ({
            id: image.id,
            attachmentId: image.attachmentId,
            detectedType: image.detectedType,
            confidence: image.confidence,
            summary: image.summary,
            missingFields: image.missingFields,
            warnings: image.warnings,
            artifactSuggestions: image.artifactSuggestions,
            styleSignals: image.styleSignals,
            fields: image.fields,
            extractedText: image.extractedText,
          })),
        },
        visionDeliverableSeed: visionBatchToDeliverableContent(batch),
        visionDeliverableFormats: visionFiles?.formats ?? [],
        visionDeliverableTitle: visionFiles?.title ?? null,
        visionGeneratedDeliverables: visionFiles?.deliverables ?? [],
        visionDeliverablesOk: visionFiles?.ok ?? false,
        visionDeliverablesDownloadable: visionFiles?.downloadable ?? false,
        visionStyleSavePrompt: batch.images.some((image) => image.styleSignals)
          ? {
              options: ["session_only", "profile_save", "discard"] as const,
              message:
                "この画像の文体・構成をどう扱いますか？（今回だけ / プロフィールへ保存 / 保存しない）",
            }
          : null,
      },
      batch,
      skipped: false,
    };
  } catch (error) {
    const gate = enrichGateFromDiagnostic(
      mapVisionErrorToGate(error, diagnosticId),
      input.userId,
    );
    return {
      assignment: cleanAssignment,
      metadata: {
        ...(input.metadata ?? {}),
        attachmentIds,
        visionStatus: gate.status,
        visionAnalysisSuccess: false,
        visionError: gate.message,
        visionUserCode: gate.userCode,
        visionDiagnosticId: gate.diagnosticId ?? diagnosticId,
        visionFailedStage: gate.failedStage ?? null,
        visionFailedStageLabel: gate.failedStageLabel ?? null,
        visionDeveloperCode: gate.developerCode ?? null,
        visionDeveloperHint: formatVisionDeveloperHint({
          diagnosticId: gate.diagnosticId ?? diagnosticId,
          failedStage: isVisionPipelineStage(gate.failedStage)
            ? gate.failedStage
            : null,
          userCode: gate.userCode,
          errorCode: gate.developerCode,
        }),
      },
      batch: null,
      skipped: false,
      gate,
    };
  }
}

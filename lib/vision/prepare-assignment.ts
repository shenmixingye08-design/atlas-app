import "server-only";

import { analyzeUserImageBatch } from "@/lib/vision/analyze-batch";
import { buildVisionEnrichedAssignment } from "@/lib/vision/adapters/to-assignment-context";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import {
  evaluateVisionBatchGate,
  stripVisionPoisonText,
} from "@/lib/vision/gate";
import {
  appendVisionDiagnosticStage,
  createVisionDiagnostic,
} from "@/lib/vision/diagnostics";
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

function toGatePayload(
  status: VisionGatePayload["status"],
  message: string,
  userCode: string,
  analysisSuccess: boolean,
  diagnosticId?: string | null,
): VisionGatePayload {
  return {
    status,
    analysisSuccess,
    message,
    userCode,
    diagnosticId: diagnosticId ?? null,
  };
}

function mapVisionErrorToGate(error: unknown): VisionGatePayload {
  if (error instanceof VisionError) {
    if (error.code === "config_missing") {
      return toGatePayload("config_missing", error.message, "config_missing", false);
    }
    if (error.code === "storage_failed" || error.code === "empty_image" || error.code === "not_found") {
      return toGatePayload("needs_image_retry", "画像取得失敗", "image_fetch_failed", false);
    }
    if (error.code === "unsupported_type" || error.code === "invalid_data_url") {
      return toGatePayload("needs_image_retry", "画像形式不正", "image_format_invalid", false);
    }
    if (error.code === "json_parse_failed") {
      return toGatePayload("vision_failed", "構造化失敗", "schema_failed", false);
    }
    if (error.code === "openai_failed" || error.code === "timeout" || error.code === "rate_limited") {
      return toGatePayload("vision_failed", "AI解析失敗", "ai_analyze_failed", false);
    }
    return toGatePayload(
      "vision_failed",
      "画像の内容を解析できませんでした",
      "image_analyze_failed",
      false,
    );
  }
  const message = error instanceof Error ? error.message : "";
  if (/supabase|SERVICE_ROLE|設定が不足/i.test(message)) {
    return toGatePayload(
      "config_missing",
      "画像保存の設定が不足しています",
      "config_missing",
      false,
    );
  }
  return toGatePayload(
    "vision_failed",
    "画像の内容を解析できませんでした",
    "image_analyze_failed",
    false,
  );
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
        },
        batch,
        skipped: false,
        gate: toGatePayload(
          gate.status === "needs_input" ? "needs_input" : "vision_failed",
          gate.message,
          gate.userCode,
          gate.analysisSuccess,
        ),
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
        },
        batch,
        skipped: false,
        gate: toGatePayload(
          gate.status === "needs_input" ? "needs_input" : "vision_failed",
          gate.message,
          gate.userCode,
          gate.analysisSuccess,
          batchDiagnosticId,
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
    const gate = mapVisionErrorToGate(error);
    return {
      assignment: cleanAssignment,
      metadata: {
        ...(input.metadata ?? {}),
        attachmentIds,
        visionStatus: gate.status,
        visionAnalysisSuccess: false,
        visionError: gate.message,
        visionUserCode: gate.userCode,
      },
      batch: null,
      skipped: false,
      gate,
    };
  }
}

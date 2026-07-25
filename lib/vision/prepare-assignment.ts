import "server-only";

import { analyzeUserImageBatch } from "@/lib/vision/analyze-batch";
import { buildVisionEnrichedAssignment } from "@/lib/vision/adapters/to-assignment-context";
import { visionBatchToDeliverableContent } from "@/lib/vision/adapters/to-artifact-source";
import { isVisionDetectedType } from "@/lib/vision/schemas";
import type { VisionBatchResult, VisionDetectedType } from "@/lib/vision/types";
import { readEffectiveCostSavingMode } from "@/lib/cost-optimization/metadata";

export type VisionPrepareResult = {
  assignment: string;
  metadata: Record<string, unknown>;
  batch: VisionBatchResult | null;
  skipped: boolean;
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

/**
 * If metadata.attachmentIds is present, run vision analysis and enrich assignment.
 * Safe no-op when there are no images — keeps text-only flows unchanged.
 */
export async function prepareAssignmentWithVision(input: {
  userId: string;
  assignment: string;
  metadata?: Readonly<Record<string, unknown>>;
  forceRefresh?: boolean;
}): Promise<VisionPrepareResult> {
  const attachmentIds = readAttachmentIds(input.metadata);
  if (attachmentIds.length === 0) {
    return {
      assignment: input.assignment,
      metadata: { ...(input.metadata ?? {}) },
      batch: null,
      skipped: true,
    };
  }

  // Reuse prior batch if already attached (e.g. re-submit after needs_input).
  const existing = input.metadata?.visionBatch;
  if (
    existing &&
    typeof existing === "object" &&
    !input.forceRefresh &&
    input.metadata?.visionReuse === true
  ) {
    const batch = existing as VisionBatchResult;
    return {
      assignment: buildVisionEnrichedAssignment({
        assignment: input.assignment,
        batch,
      }),
      metadata: {
        ...(input.metadata ?? {}),
        visionStatus: batch.status,
        visionDeliverableSeed: visionBatchToDeliverableContent(batch),
      },
      batch,
      skipped: false,
    };
  }

  const ecoMode = readEffectiveCostSavingMode(input.metadata) === "low";
  const batch = await analyzeUserImageBatch({
    userId: input.userId,
    attachmentIds,
    userText: input.assignment,
    overrideType: readOverrideType(input.metadata),
    ecoMode,
    forceRefresh: input.forceRefresh,
    jobId: typeof input.metadata?.jobId === "string" ? input.metadata.jobId : null,
  });

  const enriched = buildVisionEnrichedAssignment({
    assignment: input.assignment,
    batch,
  });

  return {
    assignment: enriched,
    metadata: {
      ...(input.metadata ?? {}),
      attachmentIds,
      visionBatchId: batch.id,
      visionStatus: batch.status,
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
        })),
      },
      visionDeliverableSeed: visionBatchToDeliverableContent(batch),
      // Style reference is never auto-saved into User Profile.
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
}

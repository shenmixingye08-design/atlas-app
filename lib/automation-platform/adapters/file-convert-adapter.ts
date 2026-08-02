import "server-only";

import {
  emptyCostUsage,
  failResult,
  newRequestIds,
  type AutomationStepAdapter,
} from "@/lib/automation-platform/adapters/types";
import {
  buildArtifactGenerationKey,
  completeIdempotencyRecord,
  reserveIdempotencyKey,
} from "@/lib/automation-platform/adapters/idempotency-store";
import { generateDeliverables } from "@/lib/deliverables";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import type { DeliverableFormat } from "@/lib/deliverables/types";

/**
 * Converts a prior deliverable into PDF by regenerating from stored source content.
 * Does not invent binary conversion — uses existing deliverables engine.
 */
export const fileConvertAdapter: AutomationStepAdapter = {
  type: "file_convert",
  async validateConfiguration(context) {
    const hasPrior = context.priorArtifacts.some(
      (a) => a.kind === "deliverable",
    );
    if (!hasPrior) {
      return {
        ok: false,
        code: "insufficient_input",
        message: "変換元の成果物が前の手順にありません",
        needsUserInput: true,
      };
    }
    return { ok: true, code: "ok", message: "ok" };
  },
  async execute(context) {
    const startedAt = new Date().toISOString();
    const prior = context.priorArtifacts.find((a) => a.kind === "deliverable");
    if (!prior) {
      return failResult({
        status: "needs_input",
        summary: "変換元の成果物がありません",
        errorCode: "automation_integration_required",
        errorMessage: "source deliverable missing",
        startedAt,
      });
    }

    const targetFormat =
      (context.step.configuration.targetFormat as DeliverableFormat | undefined) ??
      "pdf";
    if (!["pdf", "docx", "xlsx", "pptx"].includes(targetFormat)) {
      return failResult({
        status: "failed",
        summary: "未対応の変換先フォーマットです",
        errorCode: "automation_unsupported_step",
        errorMessage: `unsupported targetFormat ${targetFormat}`,
        startedAt,
      });
    }

    const sourceId = prior.externalId ?? prior.id;
    const stored = await getStoredDeliverableForUser(sourceId, context.userId);
    if (!stored?.sourceContent?.trim()) {
      return failResult({
        status: "failed",
        summary: "変換元の本文を取得できませんでした",
        errorCode: "automation_run_failed",
        errorMessage: "sourceContent missing",
        retryable: true,
        startedAt,
      });
    }

    const key = buildArtifactGenerationKey({
      runId: context.runId,
      stepId: context.step.id,
      attempt: context.attempt,
      format: targetFormat,
    });
    const reserved = await reserveIdempotencyKey({
      userId: context.userId,
      key,
      kind: "artifact",
      runId: context.runId,
      stepId: context.step.id,
    });
    if (!reserved.created && reserved.record.artifactId) {
      const ids = newRequestIds();
      return {
        status: "succeeded",
        startedAt,
        completedAt: new Date().toISOString(),
        summary: "変換済み成果物を再利用しました（重複防止）",
        outputBindings: { artifactId: reserved.record.artifactId },
        artifacts: [
          {
            id: reserved.record.artifactId,
            kind: "deliverable",
            label: `converted.${targetFormat}`,
            url: `/api/deliverables/${encodeURIComponent(reserved.record.artifactId)}`,
            externalId: reserved.record.artifactId,
            createdAt: reserved.record.createdAt,
            sourceRunId: context.runId,
            sourceStepId: context.step.id,
          },
        ],
        artifactIds: [reserved.record.artifactId],
        externalActionIds: [],
        notificationIds: [],
        requestId: ids.requestId,
        diagnosticId: ids.diagnosticId,
        retryable: false,
        errorCode: null,
        errorMessage: null,
        costUsage: emptyCostUsage(),
      };
    }

    const result = await generateDeliverables(
      {
        assignment: context.instructionText || "convert",
        finalDeliverable: stored.sourceContent,
        title: stored.baseFileName || context.automationName,
        formats: [targetFormat],
      },
      "https://minervot.local/automation-v2",
      {
        userId: context.userId,
        jobId: `${context.runId}_${context.step.id}_convert_${targetFormat}`,
        contentAlreadyApproved: true,
      },
    );

    const generated = result.deliverables[0];
    if (!generated || generated.sizeBytes <= 0) {
      return failResult({
        status: "failed",
        summary: "ファイル変換に失敗しました",
        errorCode: "automation_run_failed",
        errorMessage: result.failures[0]?.reasons.join("; ") ?? "convert failed",
        retryable: true,
        startedAt,
      });
    }

    await completeIdempotencyRecord({
      userId: context.userId,
      key,
      artifactId: generated.id,
    });

    const ids = newRequestIds();
    return {
      status: "succeeded",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: `${targetFormat}へ変換して保存しました`,
      outputBindings: {
        artifactId: generated.id,
        downloadUrl: generated.downloadUrl,
      },
      artifacts: [
        {
          id: generated.id,
          kind: "deliverable",
          label: generated.fileName,
          url: generated.downloadUrl,
          externalId: generated.id,
          createdAt: generated.generatedAt,
          mimeType: generated.mimeType,
          sizeBytes: generated.sizeBytes,
          sourceRunId: context.runId,
          sourceStepId: context.step.id,
        },
      ],
      artifactIds: [generated.id],
      externalActionIds: [],
      notificationIds: [],
      requestId: ids.requestId,
      diagnosticId: ids.diagnosticId,
      retryable: false,
      errorCode: null,
      errorMessage: null,
      costUsage: emptyCostUsage(),
    };
  },
};

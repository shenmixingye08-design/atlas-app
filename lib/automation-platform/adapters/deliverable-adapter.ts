import "server-only";

import {
  emptyCostUsage,
  failResult,
  newRequestIds,
  type AutomationStepAdapter,
  type AutomationStepAdapterContext,
  type StepExecutionResult,
} from "@/lib/automation-platform/adapters/types";
import {
  buildArtifactGenerationKey,
  completeIdempotencyRecord,
  reserveIdempotencyKey,
} from "@/lib/automation-platform/adapters/idempotency-store";
import type { AutomationCapabilityId } from "@/lib/automation-platform/types/step";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";
import { generateDeliverables } from "@/lib/deliverables";
import type { DeliverableFormat } from "@/lib/deliverables/types";

const FORMAT_BY_CAPABILITY: Partial<
  Record<AutomationCapabilityId, DeliverableFormat[]>
> = {
  word_generate: ["docx"],
  excel_generate: ["xlsx"],
  pdf_generate: ["pdf"],
  powerpoint_generate: ["pptx"],
  deliverable_generate: ["docx", "pdf"],
};

function resolveContent(context: AutomationStepAdapterContext): string {
  const fromConfig =
    typeof context.step.configuration.content === "string"
      ? context.step.configuration.content.trim()
      : "";
  const fromNotes = context.freeformNotes.trim();
  const fromInstruction = context.instructionText.trim();
  const fromBinding =
    typeof context.step.inputBindings.content === "string"
      ? String(context.step.inputBindings.content).trim()
      : "";

  // Explicit config wins over memory/notes/instruction.
  return fromConfig || fromBinding || fromNotes || fromInstruction;
}

function resolveTitle(context: AutomationStepAdapterContext): string {
  if (typeof context.step.configuration.title === "string") {
    return context.step.configuration.title.trim();
  }
  return `${context.automationName} / ${context.step.name}`;
}

async function executeDeliverable(
  context: AutomationStepAdapterContext,
): Promise<StepExecutionResult> {
  const startedAt = new Date().toISOString();
  const ids = newRequestIds();
  const formats = FORMAT_BY_CAPABILITY[context.step.type];
  if (!formats) {
    return failResult({
      status: "failed",
      summary: "未対応の成果物手順です",
      errorCode: "automation_unsupported_step",
      errorMessage: `No deliverable formats for ${context.step.type}`,
      startedAt,
    });
  }

  const content = resolveContent(context);
  if (!content) {
    return failResult({
      status: "needs_input",
      summary: "成果物の本文が不足しています",
      errorCode: "automation_integration_required",
      errorMessage: "deliverable content is empty",
      startedAt,
    });
  }

  const artifacts: AutomationRunArtifact[] = [];
  const artifactIds: string[] = [];

  for (const format of formats) {
    const key = buildArtifactGenerationKey({
      runId: context.runId,
      stepId: context.step.id,
      attempt: context.attempt,
      format,
    });
    const reserved = await reserveIdempotencyKey({
      userId: context.userId,
      key,
      kind: "artifact",
      runId: context.runId,
      stepId: context.step.id,
    });
    if (!reserved.created && reserved.record.artifactId) {
      artifacts.push({
        id: reserved.record.artifactId,
        kind: "deliverable",
        label: `${resolveTitle(context)}.${format}`,
        url: `/api/deliverables/${encodeURIComponent(reserved.record.artifactId)}`,
        externalId: reserved.record.artifactId,
        createdAt: reserved.record.createdAt,
        mimeType: null,
        sizeBytes: null,
        contentSha256: null,
        sourceRunId: context.runId,
        sourceStepId: context.step.id,
      });
      artifactIds.push(reserved.record.artifactId);
      continue;
    }

    const result = await generateDeliverables(
      {
        assignment: context.instructionText || content.slice(0, 200),
        finalDeliverable: content,
        title: resolveTitle(context),
        formats: [format],
      },
      "https://minervot.local/automation-v2",
      {
        userId: context.userId,
        jobId: `${context.runId}_${context.step.id}_${format}`,
        contentAlreadyApproved: context.approved,
      },
    );

    const generated = result.deliverables[0];
    if (!generated || generated.sizeBytes <= 0 || generated.isPlaceholder) {
      const reason =
        result.failures[0]?.reasons.join("; ") ??
        "deliverable generation failed validation or storage";
      return failResult({
        status: "failed",
        summary: `${format}成果物の生成または保存に失敗しました`,
        errorCode: "automation_run_failed",
        errorMessage: reason,
        retryable: true,
        startedAt,
      });
    }

    await completeIdempotencyRecord({
      userId: context.userId,
      key,
      artifactId: generated.id,
    });

    artifacts.push({
      id: generated.id,
      kind: "deliverable",
      label: generated.fileName,
      url: generated.downloadUrl,
      externalId: generated.id,
      createdAt: generated.generatedAt,
      mimeType: generated.mimeType,
      sizeBytes: generated.sizeBytes,
      contentSha256: null,
      sourceRunId: context.runId,
      sourceStepId: context.step.id,
    });
    artifactIds.push(generated.id);
  }

  if (artifacts.length === 0) {
    return failResult({
      status: "failed",
      summary: "成果物が生成されませんでした",
      errorCode: "automation_run_failed",
      errorMessage: "no artifacts produced",
      startedAt,
    });
  }

  return {
    status: "succeeded",
    startedAt,
    completedAt: new Date().toISOString(),
    summary: `${artifacts.length}件の成果物を生成・保存しました`,
    outputBindings: {
      artifactIds,
      primaryArtifactId: artifactIds[0],
      downloadUrl: artifacts[0]?.url,
    },
    artifacts,
    artifactIds,
    externalActionIds: [],
    notificationIds: [],
    requestId: ids.requestId,
    diagnosticId: ids.diagnosticId,
    retryable: false,
    errorCode: null,
    errorMessage: null,
    costUsage: { ...emptyCostUsage(), aiCalls: 0 },
  };
}

function createDeliverableAdapter(
  type: AutomationCapabilityId,
): AutomationStepAdapter {
  return {
    type,
    async validateConfiguration(context) {
      const content = resolveContent(context);
      if (!content) {
        return {
          ok: false,
          code: "insufficient_input",
          message: "成果物本文（content / instruction / notes）が必要です",
          needsUserInput: true,
        };
      }
      return { ok: true, code: "ok", message: "ok" };
    },
    execute: executeDeliverable,
  };
}

export const wordGenerateAdapter = createDeliverableAdapter("word_generate");
export const excelGenerateAdapter = createDeliverableAdapter("excel_generate");
export const pdfGenerateAdapter = createDeliverableAdapter("pdf_generate");
export const powerpointGenerateAdapter = createDeliverableAdapter(
  "powerpoint_generate",
);
export const deliverableGenerateAdapter = createDeliverableAdapter(
  "deliverable_generate",
);

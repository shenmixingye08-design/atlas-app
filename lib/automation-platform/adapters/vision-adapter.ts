import "server-only";

import {
  emptyCostUsage,
  failResult,
  newRequestIds,
  type AutomationStepAdapter,
  type StepExecutionResult,
} from "@/lib/automation-platform/adapters/types";

function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function resolveAttachmentId(
  context: Parameters<AutomationStepAdapter["execute"]>[0],
): string {
  if (typeof context.step.configuration.attachmentId === "string") {
    return context.step.configuration.attachmentId.trim();
  }
  if (typeof context.step.inputBindings.attachmentId === "string") {
    return String(context.step.inputBindings.attachmentId).trim();
  }
  return "";
}

async function executeVisionLike(
  context: Parameters<AutomationStepAdapter["execute"]>[0],
  label: string,
): Promise<StepExecutionResult> {
  const startedAt = new Date().toISOString();
  if (!openaiConfigured()) {
    return failResult({
      status: "needs_configuration",
      summary: `${label}には OPENAI_API_KEY の設定が必要です`,
      errorCode: "automation_integration_required",
      errorMessage: "OPENAI_API_KEY missing",
      startedAt,
    });
  }

  const attachmentId = resolveAttachmentId(context);
  if (!attachmentId) {
    return failResult({
      status: "needs_input",
      summary: `${label}には画像 attachmentId が必要です`,
      errorCode: "automation_integration_required",
      errorMessage: "attachmentId required",
      startedAt,
    });
  }

  try {
    const { analyzeUserImageBatch } = await import("@/lib/vision/analyze-batch");
    const { evaluateVisionBatchGate } = await import("@/lib/vision/gate");

    const batch = await analyzeUserImageBatch({
      userId: context.userId,
      attachmentIds: [attachmentId],
      userText:
        context.instructionText ||
        context.freeformNotes ||
        `${label}を実行`,
      forceRefresh: false,
    });

    const gate = evaluateVisionBatchGate({
      batch,
      userText: context.instructionText || label,
    });

    if (gate.status !== "ok") {
      return failResult({
        status: gate.status === "needs_input" ? "needs_input" : "failed",
        summary: gate.message || `${label}の品質ゲートに失敗しました`,
        errorCode:
          gate.status === "needs_input"
            ? "automation_integration_required"
            : "automation_run_failed",
        errorMessage: gate.status,
        retryable: gate.status !== "needs_input",
        startedAt,
      });
    }

    const primary = batch.images[0];
    const ids = newRequestIds();
    const artifactId = `vision_${ids.requestId}`;
    return {
      status: "succeeded",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: `${label}が完了しました`,
      outputBindings: {
        attachmentId,
        detectedType: primary?.detectedType ?? null,
        extractedText: primary?.extractedText?.slice(0, 2000) ?? "",
        combinedSummary: batch.combinedSummary,
      },
      artifacts: [
        {
          id: artifactId,
          kind: "file",
          label: `${label}結果`,
          url: null,
          externalId: attachmentId,
          createdAt: new Date().toISOString(),
          sourceRunId: context.runId,
          sourceStepId: context.step.id,
        },
      ],
      artifactIds: [artifactId],
      externalActionIds: [],
      notificationIds: [],
      requestId: ids.requestId,
      diagnosticId: ids.diagnosticId,
      retryable: false,
      errorCode: null,
      errorMessage: null,
      costUsage: {
        ...emptyCostUsage(),
        aiCalls: 1,
        estimatedTokens: batch.cost
          ? batch.cost.inputTokens + batch.cost.outputTokens
          : null,
      },
    };
  } catch (error) {
    return failResult({
      status: "failed",
      summary: `${label}の実行に失敗しました`,
      errorCode: "automation_run_failed",
      errorMessage: error instanceof Error ? error.message : "vision failed",
      retryable: true,
      startedAt,
    });
  }
}

export const visionAnalysisAdapter: AutomationStepAdapter = {
  type: "vision_analysis",
  async validateConfiguration(context) {
    if (!openaiConfigured()) {
      return {
        ok: false,
        code: "missing_configuration",
        message: "OPENAI_API_KEY が未設定です",
      };
    }
    if (!resolveAttachmentId(context)) {
      return {
        ok: false,
        code: "insufficient_input",
        message: "attachmentId が必要です",
        needsUserInput: true,
      };
    }
    return { ok: true, code: "ok", message: "ok" };
  },
  execute: (ctx) => executeVisionLike(ctx, "画像解析"),
};

export const ocrAdapter: AutomationStepAdapter = {
  type: "ocr",
  async validateConfiguration(context) {
    return visionAnalysisAdapter.validateConfiguration(context);
  },
  execute: (ctx) => executeVisionLike(ctx, "OCR"),
};

export const dataExtractAdapter: AutomationStepAdapter = {
  type: "data_extract",
  async validateConfiguration(context) {
    return visionAnalysisAdapter.validateConfiguration(context);
  },
  execute: (ctx) => executeVisionLike(ctx, "データ抽出"),
};

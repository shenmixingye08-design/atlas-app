/**
 * Vision / OCR Production invokers for V2 Automation.
 * Mock fallback is forbidden. Missing input or API failure → fail closed.
 */

import "server-only";

import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import { analyzeUserImage } from "@/lib/vision/analyze-image";
import { VisionError } from "@/lib/vision/types";

function stringConfig(
  configuration: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = configuration[key];
  return typeof value === "string" ? value.trim() : "";
}

function resolveAttachmentId(step: AutomationWorkflowStep): string {
  return (
    stringConfig(step.configuration, "attachmentId") ||
    stringConfig(step.configuration, "imageAttachmentId") ||
    stringConfig(step.inputBindings as Record<string, unknown>, "attachmentId")
  );
}

export async function invokeVisionStep(input: {
  step: AutomationWorkflowStep;
  userId: string;
  runId: string;
}): Promise<StepInvokeResult> {
  const attachmentId = resolveAttachmentId(input.step);
  if (!attachmentId) {
    return {
      ok: false,
      summary: "解析する画像が指定されていません",
      artifacts: [],
      errorCode: "automation_integration_required",
      errorMessage: "attachmentId_required",
      failedStage: "VISION_INPUT",
      retryable: false,
      needsUserInput: true,
    };
  }

  const userText =
    stringConfig(input.step.configuration, "userText") ||
    stringConfig(input.step.configuration, "prompt") ||
    "画像の内容を理解し、仕事に使える要点を整理してください。";

  try {
    const result = await analyzeUserImage({
      userId: input.userId,
      attachmentId,
      userText,
      jobId: input.runId,
      forceRefresh: stringConfig(input.step.configuration, "forceRefresh") === "true",
    });

    if (!result.id || !result.summary?.trim()) {
      return {
        ok: false,
        summary: "Vision解析結果が不完全です",
        artifacts: [],
        errorCode: "automation_run_failed",
        errorMessage: "vision_result_incomplete",
        failedStage: "VISION_VALIDATE",
        retryable: true,
      };
    }

    const diagnosticId = result.diagnosticId ?? result.id;
    return {
      ok: true,
      summary: `Vision解析を完了しました（信頼度 ${(result.confidence * 100).toFixed(0)}%）`,
      artifacts: [
        {
          id: result.id,
          kind: "file",
          label: "Vision解析結果",
          url: `/api/vision/diagnostics/${encodeURIComponent(diagnosticId)}`,
          externalId: diagnosticId,
          createdAt: new Date().toISOString(),
        },
      ],
      evidence: {
        artifactIds: [result.id],
        storageObjectIds: [attachmentId],
        externalActionIds: [diagnosticId],
        externalUrls: [
          `/api/vision/diagnostics/${encodeURIComponent(diagnosticId)}`,
        ],
        notificationIds: [],
      },
    };
  } catch (error) {
    if (error instanceof VisionError) {
      return {
        ok: false,
        summary: error.message,
        artifacts: [],
        errorCode: "automation_run_failed",
        errorMessage: error.code,
        failedStage: error.failedStage ?? "VISION_ANALYZE",
        retryable: error.code !== "config_missing",
      };
    }
    return {
      ok: false,
      summary: "Vision解析に失敗しました",
      artifacts: [],
      errorCode: "automation_run_failed",
      errorMessage: error instanceof Error ? error.message : "vision_failed",
      failedStage: "VISION_ANALYZE",
      retryable: true,
    };
  }
}

/**
 * OCR must produce extracted text — summary-only Vision output is not OCR success.
 * P2-05: honor durable OCR engine evaluation policy (Document AI only if required).
 */
export async function invokeOcrStep(input: {
  step: AutomationWorkflowStep;
  userId: string;
  runId: string;
}): Promise<StepInvokeResult> {
  const attachmentId = resolveAttachmentId(input.step);
  if (!attachmentId) {
    return {
      ok: false,
      summary: "OCR対象の画像が指定されていません",
      artifacts: [],
      errorCode: "automation_integration_required",
      errorMessage: "attachmentId_required",
      failedStage: "OCR_INPUT",
      retryable: false,
      needsUserInput: true,
    };
  }

  // P2-05: if evaluation required a dedicated engine but it is not configured,
  // fail closed — never pretend Vision OCR is product OCR.
  try {
    const { resolveActiveOcrPolicy } = await import("@/lib/ocr-engine/policy");
    const policy = await resolveActiveOcrPolicy();
    if (policy.failClosedReason) {
      return {
        ok: false,
        summary: "専用OCRエンジンが必要な状態ですが未設定です",
        artifacts: [],
        errorCode: "automation_run_failed",
        errorMessage: policy.failClosedReason,
        failedStage: "OCR_ENGINE_POLICY",
        retryable: false,
      };
    }
  } catch (error) {
    console.warn("[ocr] policy resolve failed; continuing with Vision OCR path", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const userText =
    stringConfig(input.step.configuration, "userText") ||
    "画像内の文字を正確に読み取り、抽出テキストのみを優先して返してください。";

  try {
    const result = await analyzeUserImage({
      userId: input.userId,
      attachmentId,
      userText,
      jobId: input.runId,
      detail: "high",
      forceRefresh: true,
    });

    const extracted = result.extractedText?.trim() ?? "";
    if (extracted.length < 1) {
      return {
        ok: false,
        summary: "OCRで文字を抽出できませんでした",
        artifacts: [],
        errorCode: "automation_run_failed",
        errorMessage: "ocr_empty_text",
        failedStage: "OCR_VALIDATE",
        retryable: true,
      };
    }

    const minConfidence =
      typeof input.step.configuration.minConfidence === "number"
        ? input.step.configuration.minConfidence
        : 0.35;

    if (result.confidence < minConfidence) {
      return {
        ok: false,
        summary: "OCR信頼度が低いため確認が必要です",
        artifacts: [],
        errorCode: "automation_approval_required",
        errorMessage: `ocr_low_confidence:${result.confidence}`,
        failedStage: "OCR_CONFIDENCE",
        retryable: false,
        needsUserInput: true,
      };
    }

    const diagnosticId = result.diagnosticId ?? result.id;
    return {
      ok: true,
      summary: `OCRで ${extracted.length} 文字を抽出しました`,
      artifacts: [
        {
          id: `ocr_${result.id}`,
          kind: "file",
          label: "OCR抽出結果",
          url: `/api/vision/diagnostics/${encodeURIComponent(diagnosticId)}`,
          externalId: diagnosticId,
          createdAt: new Date().toISOString(),
        },
      ],
      evidence: {
        artifactIds: [`ocr_${result.id}`],
        storageObjectIds: [attachmentId],
        externalActionIds: [diagnosticId],
        externalUrls: [
          `/api/vision/diagnostics/${encodeURIComponent(diagnosticId)}`,
        ],
        notificationIds: [],
      },
    };
  } catch (error) {
    if (error instanceof VisionError) {
      return {
        ok: false,
        summary: error.message,
        artifacts: [],
        errorCode: "automation_run_failed",
        errorMessage: error.code,
        failedStage: error.failedStage ?? "OCR_ANALYZE",
        retryable: error.code !== "config_missing",
      };
    }
    return {
      ok: false,
      summary: "OCRに失敗しました",
      artifacts: [],
      errorCode: "automation_run_failed",
      errorMessage: error instanceof Error ? error.message : "ocr_failed",
      failedStage: "OCR_ANALYZE",
      retryable: true,
    };
  }
}

import "server-only";

import { assertAttachmentBackendReady } from "@/lib/attachments/backend";
import { toDataUrl } from "@/lib/attachments/preprocess";
import { getImageAttachmentForUser, readProcessedImageBytes } from "@/lib/attachments/store";
import { getCachedVisionAnalysis, setCachedVisionAnalysis } from "@/lib/vision/cache";
import { classifyImagePurposeFromText, recommendDetailLevel } from "@/lib/vision/classify";
import {
  appendVisionCostRecord,
  estimateImageInputTokens,
  estimateVisionCostUsd,
  recordVisionBillingUsage,
} from "@/lib/vision/cost";
import {
  appendVisionDiagnosticStage,
  createVisionDiagnostic,
} from "@/lib/vision/diagnostics";
import { openAiVisionProvider } from "@/lib/vision/openai-vision-provider";
import type { VisionProvider } from "@/lib/vision/provider";
import {
  VISION_PROMPT_VERSION,
  VisionError,
  rethrowVisionError,
  type VisionAnalysisResult,
  type VisionDetailLevel,
  type VisionDetectedType,
} from "@/lib/vision/types";

function mapStorageConfigError(
  error: unknown,
  diagnosticId: string | null,
): VisionError {
  const message = error instanceof Error ? error.message : "";
  if (/supabase|service role|SUPABASE_/i.test(message)) {
    return new VisionError(
      "config_missing",
      "画像保存の設定が不足しています。管理者に連絡してください",
      { diagnosticId, failedStage: "storage_save" },
    );
  }
  return new VisionError("storage_failed", "解析用画像の読み込みに失敗しました", {
    diagnosticId,
    failedStage: "storage_download",
  });
}

export async function analyzeUserImage(input: {
  userId: string;
  attachmentId: string;
  userText: string;
  hintType?: VisionDetectedType;
  detail?: VisionDetailLevel;
  ecoMode?: boolean;
  pageIndex?: number;
  pageCount?: number;
  forceRefresh?: boolean;
  provider?: VisionProvider;
  jobId?: string | null;
  diagnosticId?: string | null;
}): Promise<VisionAnalysisResult & { diagnosticId?: string }> {
  let diagnosticId = input.diagnosticId ?? null;
  if (!diagnosticId) {
    diagnosticId = createVisionDiagnostic({
      userId: input.userId,
      attachmentId: input.attachmentId,
      jobId: input.jobId,
    }).id;
  }

  try {
    assertAttachmentBackendReady();
  } catch (error) {
    appendVisionDiagnosticStage(diagnosticId, "storage_download", false, {
      analysisSuccess: false,
      errorCode: "config_missing",
      userCode: "config_missing",
    });
    throw mapStorageConfigError(error, diagnosticId);
  }

  const meta = await getImageAttachmentForUser(input.userId, input.attachmentId);
  if (!meta) {
    appendVisionDiagnosticStage(diagnosticId, "storage_download", false, {
      analysisSuccess: false,
      errorCode: "not_found",
      userCode: "image_fetch_failed",
    });
    throw new VisionError("not_found", "画像が見つからないか、アクセスできません", {
      diagnosticId,
      failedStage: "storage_download",
    });
  }

  appendVisionDiagnosticStage(diagnosticId, "upload", true, {
    downloadedByteLength: meta.processedBytes,
    mimeType: meta.mimeType,
  });

  const hintType =
    input.hintType ?? classifyImagePurposeFromText(input.userText, "unknown");
  const detail =
    input.detail ??
    recommendDetailLevel({
      detectedType: hintType,
      userText: input.userText,
      imageCount: input.pageCount ?? 1,
      ecoMode: input.ecoMode,
    });

  if (!input.forceRefresh) {
    const cached = await getCachedVisionAnalysis({
      userId: input.userId,
      contentHash: meta.contentHash,
      detail,
      promptVersion: VISION_PROMPT_VERSION,
    });
    if (cached) {
      appendVisionDiagnosticStage(diagnosticId, "vision_response", true, {
        model: cached.model,
        analysisSuccess: true,
      });
      return {
        ...cached,
        attachmentId: input.attachmentId,
        cached: true,
        pageIndex: input.pageIndex ?? cached.pageIndex,
        diagnosticId,
      };
    }
  }

  let bytes;
  try {
    bytes = await readProcessedImageBytes(input.userId, input.attachmentId);
  } catch (error) {
    appendVisionDiagnosticStage(diagnosticId, "storage_download", false, {
      analysisSuccess: false,
      errorCode: "storage_failed",
      userCode: "image_fetch_failed",
    });
    throw mapStorageConfigError(error, diagnosticId);
  }

  if (!bytes || bytes.buffer.length <= 0) {
    appendVisionDiagnosticStage(diagnosticId, "storage_download", false, {
      downloadedByteLength: 0,
      errorCode: "empty_image",
      userCode: "image_fetch_failed",
    });
    throw new VisionError("empty_image", "画像取得失敗：解析用画像が空です", {
      diagnosticId,
      failedStage: "storage_download",
    });
  }

  appendVisionDiagnosticStage(diagnosticId, "storage_download", true, {
    downloadedByteLength: bytes.buffer.length,
    mimeType: bytes.mimeType,
  });

  const imageUrl = toDataUrl(bytes.mimeType, bytes.buffer);
  if (!imageUrl.includes(";base64,") || imageUrl.length < 64) {
    appendVisionDiagnosticStage(diagnosticId, "data_url", false, {
      base64Length: imageUrl.length,
      mimeType: bytes.mimeType,
      errorCode: "invalid_data_url",
      userCode: "image_format_invalid",
    });
    throw new VisionError("invalid_data_url", "画像データの生成に失敗しました", {
      diagnosticId,
      failedStage: "data_url",
    });
  }

  appendVisionDiagnosticStage(diagnosticId, "data_url", true, {
    base64Length: imageUrl.length,
    mimeType: bytes.mimeType,
  });

  const provider = input.provider ?? openAiVisionProvider;
  const started = Date.now();

  try {
    const { result, model, inputTokens, outputTokens } = await provider.analyzeImage({
      userId: input.userId,
      attachmentId: input.attachmentId,
      imageUrl,
      userText: input.userText,
      hintType,
      detail,
      pageIndex: input.pageIndex ?? 0,
      pageCount: input.pageCount ?? 1,
      jobId: input.jobId,
      diagnosticId,
    });

    const resolvedInputTokens =
      inputTokens > 0 ? inputTokens : estimateImageInputTokens(detail, 1) + 400;
    const resolvedOutputTokens = outputTokens > 0 ? outputTokens : 800;
    const estimatedCostUsd = estimateVisionCostUsd({
      inputTokens: resolvedInputTokens,
      outputTokens: resolvedOutputTokens,
    });

    await setCachedVisionAnalysis({
      userId: input.userId,
      contentHash: meta.contentHash,
      detail,
      promptVersion: VISION_PROMPT_VERSION,
      result,
    });

    await appendVisionCostRecord({
      userId: input.userId,
      jobId: input.jobId ?? null,
      imageCount: 1,
      originalBytes: meta.originalBytes,
      processedBytes: bytes.buffer.length,
      detailLevel: detail,
      model,
      inputTokens: resolvedInputTokens,
      outputTokens: resolvedOutputTokens,
      estimatedCostUsd,
      durationMs: Date.now() - started,
      success: true,
      cached: false,
      createdAt: new Date().toISOString(),
    });

    recordVisionBillingUsage({
      userId: input.userId,
      model,
      inputTokens: resolvedInputTokens,
      outputTokens: resolvedOutputTokens,
      estimatedCostUsd,
      cached: false,
    });

    appendVisionDiagnosticStage(diagnosticId, "artifact_handoff", true, {
      analysisSuccess: true,
      model,
    });

    return { ...result, diagnosticId };
  } catch (error) {
    await appendVisionCostRecord({
      userId: input.userId,
      jobId: input.jobId ?? null,
      imageCount: 1,
      originalBytes: meta.originalBytes,
      processedBytes: bytes.buffer.length,
      detailLevel: detail,
      model: "unknown",
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      durationMs: Date.now() - started,
      success: false,
      cached: false,
      createdAt: new Date().toISOString(),
    });
    const details =
      error instanceof VisionError && error.details
        ? Object.fromEntries(
            Object.entries(error.details).filter(
              (entry): entry is [string, string | number | boolean | null] =>
                entry[1] !== undefined,
            ),
          )
        : null;
    appendVisionDiagnosticStage(diagnosticId, "blocked", false, {
      analysisSuccess: false,
      errorCode: error instanceof VisionError ? error.code : "openai_failed",
      userCode: "ai_analyze_failed",
      ...(details ?? {}),
    });
    if (error instanceof VisionError) {
      // Preserve OpenAI status/type/code/message/request_id — never drop details.
      rethrowVisionError(error, {
        diagnosticId: error.diagnosticId ?? diagnosticId,
        failedStage: error.failedStage ?? "vision_response",
      });
    }
    const fallbackMessage =
      error instanceof Error && error.message.trim()
        ? error.message
        : "画像解析に失敗しました（非VisionError）";
    throw new VisionError("openai_failed", fallbackMessage, {
      diagnosticId,
      failedStage: "vision_response",
      details: {
        safeMessage: fallbackMessage,
        openaiErrorType: error instanceof Error ? error.name : "unknown",
        openaiErrorCode: "unhandled_exception",
      },
      cause: error,
    });
  }
}

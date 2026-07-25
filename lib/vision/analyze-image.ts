import "server-only";

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
import { openAiVisionProvider } from "@/lib/vision/openai-vision-provider";
import type { VisionProvider } from "@/lib/vision/provider";
import {
  VISION_PROMPT_VERSION,
  VisionError,
  type VisionAnalysisResult,
  type VisionDetailLevel,
  type VisionDetectedType,
} from "@/lib/vision/types";

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
}): Promise<VisionAnalysisResult> {
  const meta = await getImageAttachmentForUser(input.userId, input.attachmentId);
  if (!meta) {
    throw new VisionError("not_found", "画像が見つからないか、アクセスできません");
  }

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
      return {
        ...cached,
        attachmentId: input.attachmentId,
        cached: true,
        pageIndex: input.pageIndex ?? cached.pageIndex,
      };
    }
  }

  const bytes = await readProcessedImageBytes(input.userId, input.attachmentId);
  if (!bytes) {
    throw new VisionError("storage_failed", "解析用画像の読み込みに失敗しました");
  }

  // Download from private Storage (or local) on the server, then Base64 for OpenAI.
  // Never pass non-public Supabase object URLs that the model cannot fetch.
  const imageUrl = toDataUrl(bytes.mimeType, bytes.buffer);
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
      processedBytes: meta.processedBytes,
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

    return result;
  } catch (error) {
    await appendVisionCostRecord({
      userId: input.userId,
      jobId: input.jobId ?? null,
      imageCount: 1,
      originalBytes: meta.originalBytes,
      processedBytes: meta.processedBytes,
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
    if (error instanceof VisionError) throw error;
    throw new VisionError("openai_failed", "画像解析に失敗しました。再試行してください");
  }
}

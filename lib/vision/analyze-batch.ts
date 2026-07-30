import "server-only";

import { analyzeUserImage } from "@/lib/vision/analyze-image";
import { classifyImagePurposeFromText, recommendDetailLevel } from "@/lib/vision/classify";
import type { VisionProvider } from "@/lib/vision/provider";
import {
  VisionError,
  type VisionAnalysisResult,
  type VisionBatchResult,
  type VisionDetailLevel,
  type VisionDetectedType,
  type VisionJobStatus,
} from "@/lib/vision/types";

function majorityType(images: VisionAnalysisResult[]): VisionDetectedType {
  const counts = new Map<VisionDetectedType, number>();
  for (const image of images) {
    counts.set(image.detectedType, (counts.get(image.detectedType) ?? 0) + 1);
  }
  let best: VisionDetectedType = "unknown";
  let bestCount = -1;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  return best;
}

function recommendArtifactType(
  type: VisionDetectedType,
  userText: string,
): string | null {
  if (type === "receipt" || /家計簿/.test(userText)) return "household_excel";
  if (type === "invoice") return "invoice_excel";
  if (type === "contract" || /契約/.test(userText)) return "contract_docx";
  if (type === "chart" || /グラフ|チャート/.test(userText)) {
    return "chart_report_docx";
  }
  if (
    type === "table" ||
    type === "spreadsheet_source" ||
    /Excel|エクセル/.test(userText)
  ) {
    return "table_excel";
  }
  if (type === "sales_material" || /改善/.test(userText)) {
    return "improved_sales_doc";
  }
  if (type === "handwritten_note") return "memo_text";
  if (type === "business_card") return "contact_card";
  if (type === "screenshot") return "screenshot_summary_docx";
  if (
    type === "general_photo" ||
    type === "property_photo" ||
    type === "equipment_photo"
  ) {
    return "photo_report_docx";
  }
  if (/Word|ワード|PDF|報告書/.test(userText)) return "photo_report_docx";
  return "photo_report_docx";
}

export async function analyzeUserImageBatch(input: {
  userId: string;
  attachmentIds: string[];
  userText: string;
  overrideType?: VisionDetectedType;
  detail?: VisionDetailLevel;
  ecoMode?: boolean;
  forceRefresh?: boolean;
  provider?: VisionProvider;
  jobId?: string | null;
  diagnosticId?: string | null;
}): Promise<VisionBatchResult> {
  if (input.attachmentIds.length === 0) {
    throw new VisionError("not_found", "解析する画像がありません", {
      diagnosticId: input.diagnosticId,
      failedStage: "upload",
    });
  }

  const hintType =
    input.overrideType ??
    classifyImagePurposeFromText(input.userText, "unknown");
  const detail =
    input.detail ??
    recommendDetailLevel({
      detectedType: hintType,
      userText: input.userText,
      imageCount: input.attachmentIds.length,
      ecoMode: input.ecoMode,
    });

  const images: VisionAnalysisResult[] = [];
  const failures: string[] = [];
  let firstDiagnosticId: string | null = input.diagnosticId ?? null;
  let firstFailureError: VisionError | null = null;

  for (let i = 0; i < input.attachmentIds.length; i += 1) {
    const attachmentId = input.attachmentIds[i]!;
    try {
      const result = await analyzeUserImage({
        userId: input.userId,
        attachmentId,
        userText: input.userText,
        hintType,
        detail,
        ecoMode: input.ecoMode,
        pageIndex: i,
        pageCount: input.attachmentIds.length,
        forceRefresh: input.forceRefresh,
        provider: input.provider,
        jobId: input.jobId,
        diagnosticId: firstDiagnosticId,
      });
      if (!firstDiagnosticId && "diagnosticId" in result) {
        firstDiagnosticId =
          (result as VisionAnalysisResult & { diagnosticId?: string }).diagnosticId ??
          null;
      }
      images.push(result);
    } catch (error) {
      // Config / empty-image failures must not be swallowed into soft partial success.
      if (
        error instanceof VisionError &&
        (error.code === "config_missing" ||
          error.code === "empty_image" ||
          error.code === "storage_failed" ||
          error.code === "not_found")
      ) {
        if (!error.diagnosticId && firstDiagnosticId) {
          throw new VisionError(error.code, error.message, {
            diagnosticId: firstDiagnosticId,
            failedStage: error.failedStage,
          });
        }
        throw error;
      }
      if (error instanceof VisionError && !firstFailureError) {
        firstFailureError = error;
        if (!firstDiagnosticId && error.diagnosticId) {
          firstDiagnosticId = error.diagnosticId;
        }
      }
      const message =
        error instanceof VisionError
          ? error.message
          : "画像解析に失敗しました";
      failures.push(`${i + 1}枚目: ${message}`);
    }
  }

  if (images.length === 0) {
    const first = failures[0] ?? "画像解析に失敗しました。再試行してください";
    if (firstFailureError) {
      throw new VisionError(firstFailureError.code, first, {
        diagnosticId: firstFailureError.diagnosticId ?? firstDiagnosticId,
        failedStage: firstFailureError.failedStage ?? "vision_response",
      });
    }
    throw new VisionError("openai_failed", first, {
      diagnosticId: firstDiagnosticId,
      failedStage: "vision_response",
    });
  }

  // Stash diagnostic id for gate/UI via commonFields (no PII).
  void firstDiagnosticId;

  const dominant = majorityType(images);
  const allMissing = Array.from(
    new Set(images.flatMap((image) => image.missingFields)),
  );
  const warnings = [
    ...images.flatMap((image) => image.warnings),
    ...failures,
  ];
  const mergedTables = images.flatMap((image) => image.tables);
  const combinedSummary = images
    .map((image, index) => `【画像${index + 1}】${image.summary}`)
    .join("\n");

  let status: VisionJobStatus = failures.length > 0 ? "analyzed" : "analyzed";
  let needsInput: VisionBatchResult["needsInput"];
  if (allMissing.length > 0) {
    status = "needs_input";
    needsInput = {
      message: "画像の一部を正確に読み取れませんでした",
      fields: allMissing,
    };
  }

  return {
    id: `vbatch_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    images,
    combinedSummary,
    commonFields: {
      detectedType: dominant,
      imageCount: images.length,
      ...(firstDiagnosticId ? { diagnosticId: firstDiagnosticId } : {}),
    },
    differences: failures,
    mergedTables,
    warnings,
    recommendedArtifactType: recommendArtifactType(dominant, input.userText),
    status,
    model: images[0]?.model ?? "unknown",
    detailLevel: detail,
    createdAt: new Date().toISOString(),
    needsInput,
  };
}

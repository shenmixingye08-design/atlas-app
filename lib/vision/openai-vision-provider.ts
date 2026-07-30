import "server-only";

import { createAtlasResponse } from "@/lib/openai";
import {
  appendVisionDiagnosticStage,
} from "@/lib/vision/diagnostics";
import {
  buildVisionAnalyzeInstructions,
  buildVisionAnalyzeUserText,
} from "@/lib/vision/prompts/analyze";
import { parseVisionModelPayload } from "@/lib/vision/parse-model-json";
import { resolveVisionModel } from "@/lib/vision/resolve-vision-model";
import type { VisionProvider, VisionProviderResult } from "@/lib/vision/provider";
import { VisionError, type VisionAnalysisResult } from "@/lib/vision/types";

function assertDataUrl(imageUrl: string, diagnosticId?: string | null): void {
  if (!imageUrl.startsWith("data:image/")) {
    throw new VisionError("invalid_data_url", "画像データの形式が不正です", {
      diagnosticId,
      failedStage: "data_url",
    });
  }
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageUrl)) {
    throw new VisionError(
      "invalid_data_url",
      "対応する画像データ形式ではありません",
      { diagnosticId, failedStage: "data_url" },
    );
  }
  const comma = imageUrl.indexOf(",");
  const payload = comma >= 0 ? imageUrl.slice(comma + 1) : "";
  if (payload.length < 32) {
    throw new VisionError("empty_image", "画像データが空です", {
      diagnosticId,
      failedStage: "data_url",
    });
  }
}

function mapOpenAiError(error: unknown, diagnosticId?: string | null): VisionError {
  if (error instanceof VisionError) {
    return new VisionError(error.code, error.message, {
      diagnosticId: error.diagnosticId ?? diagnosticId ?? null,
      failedStage: error.failedStage ?? "vision_response",
    });
  }
  const message = error instanceof Error ? error.message : "画像解析に失敗しました";
  const lower = message.toLowerCase();
  if (lower.includes("api key") || lower.includes("not configured")) {
    return new VisionError(
      "config_missing",
      "AI画像解析の設定が不足しています",
      { diagnosticId, failedStage: "vision_request" },
    );
  }
  if (lower.includes("rate") || lower.includes("429")) {
    return new VisionError(
      "rate_limited",
      "画像解析が混み合っています。再試行してください",
      { diagnosticId, failedStage: "vision_response" },
    );
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return new VisionError(
      "timeout",
      "画像解析がタイムアウトしました。再試行してください",
      { diagnosticId, failedStage: "vision_response" },
    );
  }
  return new VisionError(
    "openai_failed",
    "画像解析に失敗しました。再試行してください",
    { diagnosticId, failedStage: "vision_response" },
  );
}

export const openAiVisionProvider: VisionProvider = {
  id: "openai-responses",

  async analyzeImage(input): Promise<VisionProviderResult> {
    assertDataUrl(input.imageUrl, input.diagnosticId);

    const model = resolveVisionModel();
    const userText = buildVisionAnalyzeUserText({
      userText: input.userText,
      hintType: input.hintType,
      detail: input.detail,
      pageIndex: input.pageIndex,
      pageCount: input.pageCount,
    });

    const multimodalInput = [
      {
        role: "user" as const,
        content: [
          { type: "input_text" as const, text: userText },
          {
            type: "input_image" as const,
            image_url: input.imageUrl,
            detail: input.detail,
          },
        ],
      },
    ];

    const diagnosticId = input.diagnosticId ?? null;

    if (diagnosticId) {
      appendVisionDiagnosticStage(diagnosticId, "vision_request", true, {
        model,
        inputImageIncluded: true,
        base64Length: input.imageUrl.length,
      });
    }

    let response;
    try {
      response = await createAtlasResponse({
        aiTaskType: "vision_analyze",
        model,
        instructions: buildVisionAnalyzeInstructions(),
        input: multimodalInput,
      });
    } catch (error) {
      const mapped = mapOpenAiError(error, diagnosticId);
      if (diagnosticId) {
        appendVisionDiagnosticStage(diagnosticId, "vision_response", false, {
          model,
          openaiErrorCode: mapped.code,
          openaiErrorType: mapped.name,
          errorCode: mapped.code,
          userCode: "ai_analyze_failed",
        });
      }
      throw mapped;
    }

    const rawText = response.output_text ?? "";
    if (diagnosticId) {
      appendVisionDiagnosticStage(diagnosticId, "vision_response", true, {
        model: response.model ?? model,
      });
    }

    let payload;
    try {
      payload = parseVisionModelPayload(rawText);
      if (diagnosticId) {
        appendVisionDiagnosticStage(diagnosticId, "schema_validation", true, {
          analysisSuccess: true,
        });
      }
    } catch (error) {
      if (diagnosticId) {
        appendVisionDiagnosticStage(diagnosticId, "schema_validation", false, {
          analysisSuccess: false,
        });
      }
      throw error;
    }

    const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } })
      .usage;

    const result: VisionAnalysisResult = {
      id: `vis_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      attachmentId: input.attachmentId,
      detectedType: payload.detectedType,
      confidence: payload.confidence,
      summary: payload.summary || "画像を解析しました",
      extractedText: payload.extractedText ?? null,
      language: payload.language ?? null,
      fields: payload.fields ?? {},
      tables: (payload.tables ?? []).map((table) => ({
        headers: table.headers ?? [],
        rows: table.rows ?? [],
        notes: table.notes ?? null,
      })),
      visualElements: payload.visualElements ?? [],
      layout: payload.layout ?? null,
      styleSignals: payload.styleSignals ?? null,
      warnings: payload.warnings ?? [],
      missingFields: payload.missingFields ?? [],
      recommendedActions: payload.recommendedActions ?? [],
      artifactSuggestions: payload.artifactSuggestions ?? [],
      model: response.model ?? model,
      detailLevel: input.detail,
      createdAt: new Date().toISOString(),
      pageIndex: input.pageIndex,
    };

    return {
      result,
      model: result.model,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      rawText,
    };
  },
};

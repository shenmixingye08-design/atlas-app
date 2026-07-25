import "server-only";

import { createAtlasResponse } from "@/lib/openai";
import {
  buildVisionAnalyzeInstructions,
  buildVisionAnalyzeUserText,
} from "@/lib/vision/prompts/analyze";
import { parseVisionModelPayload } from "@/lib/vision/parse-model-json";
import type { VisionProvider, VisionProviderResult } from "@/lib/vision/provider";
import { VisionError, type VisionAnalysisResult } from "@/lib/vision/types";

function mapOpenAiError(error: unknown): VisionError {
  const message = error instanceof Error ? error.message : "画像解析に失敗しました";
  const lower = message.toLowerCase();
  if (lower.includes("rate") || lower.includes("429")) {
    return new VisionError(
      "rate_limited",
      "画像解析が混み合っています。再試行してください",
    );
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return new VisionError("timeout", "画像解析がタイムアウトしました。再試行してください");
  }
  return new VisionError("openai_failed", "画像解析に失敗しました。再試行してください");
}

export const openAiVisionProvider: VisionProvider = {
  id: "openai-responses",

  async analyzeImage(input): Promise<VisionProviderResult> {
    const userText = buildVisionAnalyzeUserText({
      userText: input.userText,
      hintType: input.hintType,
      detail: input.detail,
      pageIndex: input.pageIndex,
      pageCount: input.pageCount,
    });

    let response;
    try {
      response = await createAtlasResponse({
        aiTaskType: "vision_analyze",
        instructions: buildVisionAnalyzeInstructions(),
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: userText },
              {
                type: "input_image",
                image_url: input.imageUrl,
                detail: input.detail,
              },
            ],
          },
        ],
      });
    } catch (error) {
      throw mapOpenAiError(error);
    }

    const rawText = response.output_text ?? "";
    const payload = parseVisionModelPayload(rawText);
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
      model: response.model ?? "unknown",
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

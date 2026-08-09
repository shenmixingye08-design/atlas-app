/**
 * Default OCR engine: OpenAI Vision with OCR-first prompt.
 * Not a dedicated product OCR — evaluation decides if Document AI is required.
 */

import "server-only";

import { createAtlasResponse, isOpenAIConfigured } from "@/lib/openai";
import { resolveVisionModel } from "@/lib/vision/resolve-vision-model";
import { validateOpenAiImageDataUrl } from "@/lib/vision/validate-openai-image-payload";
import { VisionError } from "@/lib/vision/types";

import type { OcrEngine, OcrExtractResult } from "../types";

function buildDataUrl(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

export const openaiVisionOcrEngine: OcrEngine = {
  id: "openai_vision_ocr",
  get configured() {
    return isOpenAIConfigured();
  },
  async extractText(input): Promise<OcrExtractResult> {
    if (!isOpenAIConfigured()) {
      return {
        ok: false,
        engineId: "openai_vision_ocr",
        extractedText: "",
        confidence: 0,
        error: "openai_not_configured",
        softSuccess: false,
        configured: false,
      };
    }

    try {
      const dataUrl = buildDataUrl(input.imageBytes, input.mimeType);
      const validated = await validateOpenAiImageDataUrl({ dataUrl });
      const model = resolveVisionModel();

      const response = await createAtlasResponse({
        aiTaskType: "vision_analyze",
        model,
        temperature: 0,
        maxOutputTokens: 800,
        instructions:
          "You are a strict OCR engine. Return ONLY JSON: " +
          '{"extractedText":"...","confidence":0.0-1.0}. ' +
          "Copy every visible character exactly (codes, totals, labels). " +
          "Do not summarize. Do not invent missing text. No markdown.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  `OCR correlationId=${input.correlationId}. ` +
                  "Literal transcription of ALL visible text lines.",
              },
              {
                type: "input_image",
                image_url: validated.dataUrl,
                detail: "high",
              },
            ],
          },
        ],
      });

      const raw =
        typeof response.output_text === "string" ? response.output_text : "";

      let extractedText = "";
      let confidence = 0.5;
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            extractedText?: unknown;
            confidence?: unknown;
          };
          if (typeof parsed.extractedText === "string") {
            extractedText = parsed.extractedText;
          }
          if (
            typeof parsed.confidence === "number" &&
            Number.isFinite(parsed.confidence)
          ) {
            confidence = Math.max(0, Math.min(1, parsed.confidence));
          }
        }
      } catch {
        extractedText = raw;
        confidence = 0.4;
      }

      extractedText = extractedText.trim();
      if (!extractedText) {
        return {
          ok: false,
          engineId: "openai_vision_ocr",
          extractedText: "",
          confidence: 0,
          error: "ocr_empty_text",
          softSuccess: false,
          configured: true,
        };
      }

      return {
        ok: true,
        engineId: "openai_vision_ocr",
        extractedText,
        confidence,
        error: null,
        softSuccess: false,
        configured: true,
      };
    } catch (error) {
      const message =
        error instanceof VisionError
          ? error.code
          : error instanceof Error
            ? error.message
            : String(error);
      return {
        ok: false,
        engineId: "openai_vision_ocr",
        extractedText: "",
        confidence: 0,
        error: message,
        softSuccess: false,
        configured: true,
      };
    }
  },
};

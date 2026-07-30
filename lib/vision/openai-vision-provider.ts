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
import {
  extractOpenAiVisionErrorDetails,
  inspectVisionDataUrl,
  openAiDetailsForLog,
  type OpenAiVisionErrorDetails,
} from "@/lib/vision/openai-error-details";

/** Vision Responses API call budget — logged as timedOut when exceeded. */
export const VISION_OPENAI_TIMEOUT_MS = 120_000;

const RESPONSES_INPUT_TYPES = ["input_text", "input_image"] as const;

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

function classifyTransportFailure(
  details: OpenAiVisionErrorDetails,
  diagnosticId: string | null,
  cause: unknown,
): VisionError {
  const safe =
    details.safeMessage?.slice(0, 180) ??
    "画像解析に失敗しました。再試行してください";

  if (
    details.openaiErrorCode === "invalid_api_key" ||
    /api key|not configured/i.test(details.safeMessage ?? "")
  ) {
    return new VisionError(
      "config_missing",
      "AI画像解析の設定が不足しています",
      {
        diagnosticId,
        failedStage: "vision_request",
        details: openAiDetailsForLog(details),
        cause,
      },
    );
  }

  if (
    details.httpStatus === 429 ||
    details.openaiErrorCode === "rate_limit_exceeded" ||
    /rate.?limit/i.test(details.safeMessage ?? "")
  ) {
    return new VisionError(
      "rate_limited",
      "画像解析が混み合っています。再試行してください",
      {
        diagnosticId,
        failedStage: "vision_response",
        details: openAiDetailsForLog(details),
        cause,
      },
    );
  }

  if (details.timedOut || details.httpStatus === 408) {
    return new VisionError(
      "timeout",
      "画像解析がタイムアウトしました。再試行してください",
      {
        diagnosticId,
        failedStage: "vision_response",
        details: openAiDetailsForLog(details),
        cause,
      },
    );
  }

  // Preserve OpenAI identity in details — do not collapse type/code into VisionError alone.
  return new VisionError("openai_failed", safe, {
    diagnosticId,
    failedStage: "vision_response",
    details: openAiDetailsForLog(details),
    cause,
  });
}

function logVisionResponseFailure(
  diagnosticId: string | null,
  details: OpenAiVisionErrorDetails,
  atlasCode: string,
): void {
  if (!diagnosticId) {
    console.error("[vision]", {
      stage: "vision_response",
      ok: false,
      ...openAiDetailsForLog(details),
      atlasCode,
    });
    return;
  }
  appendVisionDiagnosticStage(diagnosticId, "vision_response", false, {
    ...openAiDetailsForLog(details),
    // Prefer raw OpenAI fields over atlas wrapper names in primary slots.
    openaiErrorCode: details.openaiErrorCode ?? atlasCode,
    openaiErrorType: details.openaiErrorType ?? "OpenAIError",
    errorCode: atlasCode,
    userCode: "ai_analyze_failed",
  });
}

export const openAiVisionProvider: VisionProvider = {
  id: "openai-responses",

  async analyzeImage(input): Promise<VisionProviderResult> {
    assertDataUrl(input.imageUrl, input.diagnosticId);

    const model = resolveVisionModel();
    const imageMeta = inspectVisionDataUrl(input.imageUrl);
    const userText = buildVisionAnalyzeUserText({
      userText: input.userText,
      hintType: input.hintType,
      detail: input.detail,
      pageIndex: input.pageIndex,
      pageCount: input.pageCount,
    });

    // Official Responses API image shape:
    // content: [{ type: "input_text", text }, { type: "input_image", image_url: data URL, detail }]
    // See https://developers.openai.com/api/docs/guides/images-vision
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
    const inputTypes = [...RESPONSES_INPUT_TYPES];

    if (diagnosticId) {
      appendVisionDiagnosticStage(diagnosticId, "vision_request", true, {
        model,
        inputImageIncluded: true,
        inputTypes: inputTypes.join(","),
        apiFormat: "responses",
        mimeType: imageMeta.mimeType,
        imageByteLength: imageMeta.imageByteLength,
        base64Length: imageMeta.base64Length,
        detail: input.detail,
        timeoutMs: VISION_OPENAI_TIMEOUT_MS,
        jobId: input.jobId ?? null,
      });
    }

    let response;
    let timedOut = false;
    try {
      response = await Promise.race([
        createAtlasResponse({
          aiTaskType: "vision_analyze",
          model,
          instructions: buildVisionAnalyzeInstructions(),
          input: multimodalInput,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            timedOut = true;
            reject(
              Object.assign(new Error("vision_openai_timeout"), {
                name: "VisionTimeoutError",
                code: "timeout",
                status: 408,
              }),
            );
          }, VISION_OPENAI_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      const details = extractOpenAiVisionErrorDetails(error, {
        model,
        inputTypes,
        mimeType: imageMeta.mimeType,
        imageByteLength: imageMeta.imageByteLength,
        base64Length: imageMeta.base64Length,
        timedOut,
      });
      const mapped = classifyTransportFailure(details, diagnosticId, error);
      logVisionResponseFailure(diagnosticId, details, mapped.code);
      throw mapped;
    }

    const responseStatus =
      typeof (response as { status?: unknown }).status === "string"
        ? (response as { status: string }).status
        : null;
    const responseError = (response as { error?: unknown }).error;
    const incomplete =
      (response as { incomplete_details?: { reason?: string } | null })
        .incomplete_details ?? null;

    if (
      responseStatus === "failed" ||
      responseStatus === "cancelled" ||
      responseError
    ) {
      const details = extractOpenAiVisionErrorDetails(
        responseError ?? {
          type: "ResponseError",
          message: `Responses API status=${responseStatus ?? "unknown"}`,
          code: responseStatus ?? "response_failed",
        },
        {
          model: response.model ?? model,
          inputTypes,
          mimeType: imageMeta.mimeType,
          imageByteLength: imageMeta.imageByteLength,
          base64Length: imageMeta.base64Length,
          responseStatus,
        },
      );
      const mapped = classifyTransportFailure(details, diagnosticId, responseError);
      logVisionResponseFailure(diagnosticId, details, mapped.code);
      throw mapped;
    }

    const rawText = response.output_text ?? "";
    if (!rawText.trim()) {
      const details: OpenAiVisionErrorDetails = {
        httpStatus: 200,
        openaiErrorType: incomplete?.reason
          ? "IncompleteResponse"
          : "EmptyOutputText",
        openaiErrorCode: incomplete?.reason ?? "empty_content",
        param: null,
        requestId:
          typeof (response as { id?: unknown }).id === "string"
            ? (response as { id: string }).id
            : null,
        safeMessage: incomplete?.reason
          ? `incomplete:${incomplete.reason}`
          : "Responses API returned empty output_text",
        model: response.model ?? model,
        inputTypes,
        mimeType: imageMeta.mimeType,
        imageByteLength: imageMeta.imageByteLength,
        base64Length: imageMeta.base64Length,
        timedOut: false,
        responseStatus,
        apiFormat: "responses",
      };
      const mapped = new VisionError(
        "openai_failed",
        "画像解析の応答が空でした。再試行してください",
        {
          diagnosticId,
          failedStage: "vision_response",
          details: openAiDetailsForLog(details),
        },
      );
      logVisionResponseFailure(diagnosticId, details, mapped.code);
      throw mapped;
    }

    if (diagnosticId) {
      appendVisionDiagnosticStage(diagnosticId, "vision_response", true, {
        model: response.model ?? model,
        responseStatus,
        inputTypes: inputTypes.join(","),
        mimeType: imageMeta.mimeType,
        imageByteLength: imageMeta.imageByteLength,
        timedOut: false,
        jobId: input.jobId ?? null,
      });
    }

    let payload;
    try {
      payload = parseVisionModelPayload(rawText);
      if (diagnosticId) {
        appendVisionDiagnosticStage(diagnosticId, "schema_validation", true, {
          analysisSuccess: true,
          jobId: input.jobId ?? null,
        });
      }
    } catch (error) {
      if (diagnosticId) {
        appendVisionDiagnosticStage(diagnosticId, "schema_validation", false, {
          analysisSuccess: false,
          jobId: input.jobId ?? null,
          errorCode:
            error instanceof VisionError ? error.code : "json_parse_failed",
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

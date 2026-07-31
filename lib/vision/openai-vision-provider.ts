import "server-only";

import {
  createAtlasResponse,
  resolveAtlasResponseCreateParams,
} from "@/lib/openai";
import {
  appendVisionDiagnosticStage,
  getVisionDiagnosticForUser,
} from "@/lib/vision/diagnostics";
import {
  buildVisionAnalyzeInstructions,
  buildVisionAnalyzeUserText,
} from "@/lib/vision/prompts/analyze";
import { parseVisionModelPayload } from "@/lib/vision/parse-model-json";
import {
  resolveVisionFallbackModel,
  resolveVisionModel,
} from "@/lib/vision/resolve-vision-model";
import type { VisionProvider, VisionProviderResult } from "@/lib/vision/provider";
import { VisionError, type VisionAnalysisResult } from "@/lib/vision/types";
import {
  buildVisionOpenAiRequestLog,
  extractOpenAiVisionErrorDetails,
  inspectVisionDataUrl,
  openAiDetailsForLog,
  type OpenAiVisionErrorDetails,
} from "@/lib/vision/openai-error-details";
import {
  normalizeImageForOpenAi,
  normalizeProfileForAttempt,
  resolveOpenAiVisionDetail,
  type NormalizedOpenAiImage,
} from "@/lib/vision/normalize-for-openai";
import {
  isRetryableOpenAiFailure,
  shouldFallbackOpenAiFailure,
  sleep,
  VISION_MAX_ATTEMPTS,
  visionRetryDelayMs,
} from "@/lib/vision/retry";
import { validateOpenAiImageDataUrl } from "@/lib/vision/validate-openai-image-payload";

/** Per-attempt OpenAI call budget (Vercel-safe). */
export const VISION_OPENAI_TIMEOUT_MS = 55_000;

const RESPONSES_INPUT_TYPES = ["input_text", "input_image"] as const;

function preferReadableText(hintType: string, userText: string): boolean {
  return (
    /receipt|invoice|estimate|contract|table|spreadsheet|handwritten|business_card|chart/i.test(
      hintType,
    ) || /文字|明細|金額|表|レシート|請求|名刺|条項/.test(userText)
  );
}

function classifyTransportFailure(
  details: OpenAiVisionErrorDetails,
  diagnosticId: string | null,
  cause: unknown,
): VisionError {
  const causeMessage =
    details.safeMessage?.trim() ||
    details.rawErrorBody?.slice(0, 500) ||
    "OpenAI vision_response failed without message";

  if (
    details.openaiErrorCode === "invalid_api_key" ||
    /api key|not configured/i.test(details.safeMessage ?? "")
  ) {
    return new VisionError(
      "config_missing",
      `AI画像解析の設定が不足しています: ${causeMessage}`,
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
      `画像解析が混み合っています（OpenAI rate limit）: ${causeMessage}`,
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
      `画像解析がタイムアウトしました: ${causeMessage}`,
      {
        diagnosticId,
        failedStage: "vision_response",
        details: openAiDetailsForLog(details),
        cause,
      },
    );
  }

  return new VisionError("openai_failed", causeMessage, {
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
  extra?: Record<string, string | number | boolean | null>,
): void {
  const payload = {
    stage: "vision_response",
    ok: false,
    ...openAiDetailsForLog(details),
    atlasCode,
    status: details.httpStatus,
    type: details.openaiErrorType,
    code: details.openaiErrorCode,
    message: details.safeMessage,
    request_id: details.requestId,
    ...(extra ?? {}),
  };

  if (!diagnosticId) {
    console.error("[vision] openai_error_full", payload);
    return;
  }
  appendVisionDiagnosticStage(diagnosticId, "vision_response", false, {
    ...openAiDetailsForLog(details),
    openaiErrorCode: details.openaiErrorCode ?? atlasCode,
    openaiErrorType: details.openaiErrorType ?? "OpenAIError",
    errorCode: atlasCode,
    userCode: "ai_analyze_failed",
    ...(extra ?? {}),
  });
  console.error("[vision] openai_error_full", {
    diagnosticId,
    ...payload,
  });
}

function extractOutputText(response: {
  output_text?: string | null;
  output?: unknown;
  status?: string | null;
}): {
  rawText: string;
  refusal: string | null;
  incompleteReason: string | null;
} {
  const incomplete =
    (response as { incomplete_details?: { reason?: string } | null })
      .incomplete_details?.reason ?? null;

  let refusal: string | null = null;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      type?: string;
      content?: Array<{ type?: string; text?: string; refusal?: string }>;
    };
    if (row.type !== "message" || !Array.isArray(row.content)) continue;
    for (const part of row.content) {
      if (part?.type === "refusal" && typeof part.refusal === "string") {
        refusal = part.refusal;
      }
      if (part?.type === "output_text" && typeof part.text === "string" && !response.output_text) {
        // Some SDK shapes put text only in content parts.
        return {
          rawText: part.text,
          refusal,
          incompleteReason: incomplete,
        };
      }
    }
  }

  return {
    rawText: response.output_text ?? "",
    refusal,
    incompleteReason: incomplete,
  };
}

async function callOpenAiVisionOnce(input: {
  model: string;
  instructions: string;
  multimodalInput: Array<{
    role: "user";
    content: Array<Record<string, unknown>>;
  }>;
  diagnosticId: string | null;
  imageMeta: ReturnType<typeof inspectVisionDataUrl>;
  timeoutMs: number;
}): Promise<{
  response: Awaited<ReturnType<typeof createAtlasResponse>>;
  timedOut: boolean;
}> {
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const response = await Promise.race([
      createAtlasResponse({
        aiTaskType: "vision_analyze",
        model: input.model,
        instructions: input.instructions,
        input: input.multimodalInput as never,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(
            Object.assign(new Error("vision_openai_timeout"), {
              name: "VisionTimeoutError",
              code: "timeout",
              status: 408,
            }),
          );
        }, input.timeoutMs);
      }),
    ]);
    return { response, timedOut: false };
  } catch (error) {
    if (timedOut) {
      const details = extractOpenAiVisionErrorDetails(error, {
        model: input.model,
        inputTypes: [...RESPONSES_INPUT_TYPES],
        mimeType: input.imageMeta.mimeType,
        imageByteLength: input.imageMeta.imageByteLength,
        base64Length: input.imageMeta.base64Length,
        imageCount: input.imageMeta.imageCount,
        urlLength: input.imageMeta.urlLength,
        timedOut: true,
      });
      throw classifyTransportFailure(details, input.diagnosticId, error);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const openAiVisionProvider: VisionProvider = {
  id: "openai-responses",

  async analyzeImage(input): Promise<VisionProviderResult> {
    const diagnosticId = input.diagnosticId ?? null;
    const primaryModel = resolveVisionModel();
    const readable = preferReadableText(input.hintType, input.userText);
    const existingDiag =
      diagnosticId && input.userId
        ? getVisionDiagnosticForUser(input.userId, diagnosticId)
        : null;
    const vercelRequestId = existingDiag?.vercelRequestId ?? null;

    let lastError: VisionError | null = null;
    let lastNormalized: NormalizedOpenAiImage | null = null;

    for (let attempt = 1; attempt <= VISION_MAX_ATTEMPTS; attempt += 1) {
      const profile = normalizeProfileForAttempt(attempt, readable);
      const model = resolveVisionFallbackModel(primaryModel, attempt);
      const openAiDetail = resolveOpenAiVisionDetail(input.detail, attempt);
      const attemptStarted = Date.now();

      let normalized: NormalizedOpenAiImage;
      try {
        // Prefer re-normalizing raw bytes when provided; else decode data URL.
        const sourceBuffer = input.imageBytes
          ? input.imageBytes
          : Buffer.from(
              input.imageUrl.slice(input.imageUrl.indexOf(",") + 1),
              "base64",
            );
        normalized = await normalizeImageForOpenAi({
          buffer: sourceBuffer,
          profile,
          diagnosticId,
        });
        lastNormalized = normalized;
      } catch (error) {
        if (error instanceof VisionError) {
          lastError = error;
          if (attempt >= VISION_MAX_ATTEMPTS) throw error;
          continue;
        }
        throw error;
      }

      // Hard gate: decode data URL → magic bytes → sharp open → disk probe.
      // Never call OpenAI when bytes are not a real JPEG/PNG.
      let validated;
      try {
        validated = await validateOpenAiImageDataUrl({
          dataUrl: normalized.dataUrl,
          diagnosticId,
          jobId: input.jobId ?? null,
        });
      } catch (error) {
        if (error instanceof VisionError) {
          lastError = error;
          if (diagnosticId) {
            appendVisionDiagnosticStage(diagnosticId, "data_url", false, {
              errorCode: error.code,
              userCode: "image_format_invalid",
              attempt,
              normalizeProfile: profile,
              headHex32:
                typeof error.details?.headHex32 === "string"
                  ? error.details.headHex32
                  : null,
            });
          }
          if (attempt >= VISION_MAX_ATTEMPTS) throw error;
          continue;
        }
        throw error;
      }

      console.info("[vision] image_send_metrics", {
        diagnosticId,
        jobId: input.jobId ?? null,
        vercelRequestId,
        attempt,
        profile: normalized.profile,
        imageCount: 1,
        mimeType: validated.mimeType,
        imageByteLength: validated.byteLength,
        bufferSize: validated.byteLength,
        base64Length: validated.base64Length,
        urlLength: validated.urlLength,
        width: validated.width,
        height: validated.height,
        originalWidth: normalized.originalWidth,
        originalHeight: normalized.originalHeight,
        detectedInputMime: normalized.detectedInputMime,
        headHex32: validated.headHex32,
        probePath: validated.probePath,
        detail: openAiDetail,
        model,
      });

      const userText = buildVisionAnalyzeUserText({
        userText: input.userText,
        hintType: input.hintType,
        detail: openAiDetail,
        pageIndex: input.pageIndex,
        pageCount: input.pageCount,
      });
      const instructions = buildVisionAnalyzeInstructions({
        hintType: input.hintType,
      });

      // Official Responses API shape:
      // { type: "input_image", image_url: "data:image/jpeg;base64,...", detail }
      // image_url MUST be a string data URL (not { url: ... }).
      const multimodalInput = [
        {
          role: "user" as const,
          content: [
            { type: "input_text" as const, text: userText },
            {
              type: "input_image" as const,
              image_url: validated.dataUrl,
              detail: openAiDetail,
            },
          ],
        },
      ];

      const requestParams = resolveAtlasResponseCreateParams({
        aiTaskType: "vision_analyze",
        model,
        instructions,
        input: multimodalInput,
      });

      const imageMeta = {
        ...inspectVisionDataUrl(validated.dataUrl),
        mimeType: validated.mimeType,
        imageByteLength: validated.byteLength,
        base64Length: validated.base64Length,
        urlLength: validated.urlLength,
        imageCount: 1 as const,
      };
      const requestLog = buildVisionOpenAiRequestLog({
        model: requestParams.model,
        instructions,
        multimodalInput,
        tools: requestParams.tools,
        responseFormat: requestParams.response_format,
        maxOutputTokens: requestParams.max_output_tokens,
        imageMetrics: imageMeta,
        detail: openAiDetail,
        diagnosticId,
        jobId: input.jobId ?? null,
        vercelRequestId,
      });
      console.info("[vision] openai_request_full", {
        ...requestLog,
        attempt,
        profile: normalized.profile,
        fallbackModel: model !== primaryModel,
        width: validated.width,
        height: validated.height,
        headHex32: validated.headHex32,
        bufferSize: validated.byteLength,
        base64Length: validated.base64Length,
        mimeType: validated.mimeType,
        image_url_is_string: typeof multimodalInput[0]?.content[1]?.image_url === "string",
        image_url_prefix: validated.dataUrl.slice(0, 22),
      });

      if (diagnosticId) {
        appendVisionDiagnosticStage(diagnosticId, "vision_request", true, {
          model: requestParams.model,
          inputImageIncluded: true,
          inputTypes: RESPONSES_INPUT_TYPES.join(","),
          apiFormat: "responses",
          mimeType: validated.mimeType,
          imageByteLength: validated.byteLength,
          base64Length: validated.base64Length,
          imageCount: 1,
          urlLength: validated.urlLength,
          width: validated.width,
          height: validated.height,
          headHex32: validated.headHex32,
          detail: openAiDetail,
          maxOutputTokens: requestParams.max_output_tokens,
          attempt,
          normalizeProfile: profile,
          fallbackModel: model !== primaryModel,
          tools: null,
          response_format: null,
          messages: null,
          timeoutMs: VISION_OPENAI_TIMEOUT_MS,
          jobId: input.jobId ?? null,
          vercelRequestId,
          matchesOfficialResponsesApi: true,
          imageUrlField: "image_url",
          imageUrlShape: "string_data_url",
        });
      }

      try {
        const { response } = await callOpenAiVisionOnce({
          model,
          instructions,
          multimodalInput,
          diagnosticId,
          imageMeta,
          timeoutMs: VISION_OPENAI_TIMEOUT_MS,
        });

        const responseStatus =
          typeof (response as { status?: unknown }).status === "string"
            ? (response as { status: string }).status
            : null;
        const responseError = (response as { error?: unknown }).error;

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
              request_id:
                typeof (response as { id?: unknown }).id === "string"
                  ? (response as { id: string }).id
                  : null,
            },
            {
              model: response.model ?? model,
              inputTypes: [...RESPONSES_INPUT_TYPES],
              mimeType: normalized.mimeType,
              imageByteLength: normalized.byteLength,
              base64Length: normalized.base64Length,
              imageCount: 1,
              urlLength: normalized.urlLength,
              responseStatus,
            },
          );
          const mapped = classifyTransportFailure(
            details,
            diagnosticId,
            responseError,
          );
          logVisionResponseFailure(diagnosticId, details, mapped.code, {
            attempt,
            normalizeProfile: profile,
            fallbackUsed: model !== primaryModel,
          });
          lastError = mapped;
          if (
            attempt < VISION_MAX_ATTEMPTS &&
            shouldFallbackOpenAiFailure(details)
          ) {
            if (isRetryableOpenAiFailure(details)) {
              await sleep(visionRetryDelayMs(attempt));
            }
            continue;
          }
          throw mapped;
        }

        const extracted = extractOutputText(response);
        if (extracted.refusal) {
          const details: OpenAiVisionErrorDetails = {
            httpStatus: 200,
            openaiErrorType: "Refusal",
            openaiErrorCode: "refusal",
            param: null,
            requestId:
              typeof (response as { id?: unknown }).id === "string"
                ? (response as { id: string }).id
                : null,
            safeMessage: extracted.refusal.slice(0, 500),
            rawErrorBody: JSON.stringify({
              status: responseStatus,
              refusal: extracted.refusal,
            }),
            model: response.model ?? model,
            inputTypes: [...RESPONSES_INPUT_TYPES],
            mimeType: normalized.mimeType,
            imageByteLength: normalized.byteLength,
            base64Length: normalized.base64Length,
            imageCount: 1,
            urlLength: normalized.urlLength,
            timedOut: false,
            responseStatus,
            apiFormat: "responses",
          };
          const mapped = new VisionError(
            "openai_failed",
            details.safeMessage ?? "refusal",
            {
              diagnosticId,
              failedStage: "vision_response",
              details: openAiDetailsForLog(details),
            },
          );
          logVisionResponseFailure(diagnosticId, details, mapped.code, {
            attempt,
          });
          lastError = mapped;
          if (attempt < VISION_MAX_ATTEMPTS) continue;
          throw mapped;
        }

        const rawText = extracted.rawText;
        if (!rawText.trim()) {
          const details: OpenAiVisionErrorDetails = {
            httpStatus: 200,
            openaiErrorType: extracted.incompleteReason
              ? "IncompleteResponse"
              : "EmptyOutputText",
            openaiErrorCode: extracted.incompleteReason ?? "empty_content",
            param: null,
            requestId:
              typeof (response as { id?: unknown }).id === "string"
                ? (response as { id: string }).id
                : null,
            safeMessage: extracted.incompleteReason
              ? `incomplete:${extracted.incompleteReason}`
              : "Responses API returned empty output_text",
            rawErrorBody: JSON.stringify({
              status: responseStatus,
              incomplete_details: extracted.incompleteReason,
              id:
                typeof (response as { id?: unknown }).id === "string"
                  ? (response as { id: string }).id
                  : null,
            }),
            model: response.model ?? model,
            inputTypes: [...RESPONSES_INPUT_TYPES],
            mimeType: normalized.mimeType,
            imageByteLength: normalized.byteLength,
            base64Length: normalized.base64Length,
            imageCount: 1,
            urlLength: normalized.urlLength,
            timedOut: false,
            responseStatus,
            apiFormat: "responses",
          };
          const mapped = new VisionError(
            "openai_failed",
            details.safeMessage ?? "empty output_text",
            {
              diagnosticId,
              failedStage: "vision_response",
              details: openAiDetailsForLog(details),
            },
          );
          logVisionResponseFailure(diagnosticId, details, mapped.code, {
            attempt,
            normalizeProfile: profile,
          });
          lastError = mapped;
          if (attempt < VISION_MAX_ATTEMPTS) {
            await sleep(visionRetryDelayMs(attempt));
            continue;
          }
          throw mapped;
        }

        if (diagnosticId) {
          appendVisionDiagnosticStage(diagnosticId, "vision_response", true, {
            model: response.model ?? model,
            responseStatus,
            inputTypes: RESPONSES_INPUT_TYPES.join(","),
            mimeType: normalized.mimeType,
            imageByteLength: normalized.byteLength,
            imageCount: 1,
            urlLength: normalized.urlLength,
            width: normalized.width,
            height: normalized.height,
            timedOut: false,
            attempt,
            normalizeProfile: profile,
            fallbackUsed: model !== primaryModel,
            durationMs: Date.now() - attemptStarted,
            jobId: input.jobId ?? null,
            requestId:
              typeof (response as { id?: unknown }).id === "string"
                ? (response as { id: string }).id
                : null,
          });
        }

        let payload;
        try {
          payload = parseVisionModelPayload(rawText);
          if (diagnosticId) {
            appendVisionDiagnosticStage(diagnosticId, "schema_validation", true, {
              analysisSuccess: true,
              jobId: input.jobId ?? null,
              attempt,
            });
          }
        } catch (error) {
          if (diagnosticId) {
            appendVisionDiagnosticStage(
              diagnosticId,
              "schema_validation",
              false,
              {
                analysisSuccess: false,
                jobId: input.jobId ?? null,
                attempt,
                errorCode:
                  error instanceof VisionError
                    ? error.code
                    : "json_parse_failed",
              },
            );
          }
          if (error instanceof VisionError && attempt < VISION_MAX_ATTEMPTS) {
            lastError = error;
            continue;
          }
          throw error;
        }

        // Validate required analysis fields — HTTP 200 + empty meaning is failure.
        if (
          !payload.summary?.trim() &&
          !payload.extractedText?.trim() &&
          Object.keys(payload.fields ?? {}).length === 0 &&
          (payload.tables?.length ?? 0) === 0
        ) {
          const mapped = new VisionError(
            "unreadable",
            "画像の文字を読み取れませんでした",
            {
              diagnosticId,
              failedStage: "schema_validation",
              details: {
                safeMessage: "empty_analysis_payload",
                attempt,
                model: response.model ?? model,
              },
            },
          );
          lastError = mapped;
          if (attempt < VISION_MAX_ATTEMPTS) continue;
          throw mapped;
        }

        const usage = (
          response as {
            usage?: { input_tokens?: number; output_tokens?: number };
          }
        ).usage;

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
          warnings: [
            ...(payload.warnings ?? []),
            ...(normalized.warnings ?? []),
            ...(attempt > 1 ? [`fallback_attempt_${attempt}`] : []),
          ],
          missingFields: payload.missingFields ?? [],
          recommendedActions: payload.recommendedActions ?? [],
          artifactSuggestions: payload.artifactSuggestions ?? [],
          model: response.model ?? model,
          detailLevel: openAiDetail,
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
      } catch (error) {
        if (error instanceof VisionError) {
          lastError = error;
          const details = error.details
            ? ({
                httpStatus:
                  typeof error.details.httpStatus === "number"
                    ? error.details.httpStatus
                    : null,
                openaiErrorType:
                  typeof error.details.openaiErrorType === "string"
                    ? error.details.openaiErrorType
                    : null,
                openaiErrorCode:
                  typeof error.details.openaiErrorCode === "string"
                    ? error.details.openaiErrorCode
                    : null,
                param:
                  typeof error.details.param === "string"
                    ? error.details.param
                    : null,
                requestId:
                  typeof error.details.requestId === "string"
                    ? error.details.requestId
                    : null,
                safeMessage:
                  typeof error.details.safeMessage === "string"
                    ? error.details.safeMessage
                    : error.message,
                rawErrorBody:
                  typeof error.details.rawErrorBody === "string"
                    ? error.details.rawErrorBody
                    : null,
                model: model,
                inputTypes: [...RESPONSES_INPUT_TYPES],
                mimeType: lastNormalized?.mimeType ?? null,
                imageByteLength: lastNormalized?.byteLength ?? null,
                base64Length: lastNormalized?.base64Length ?? null,
                imageCount: 1,
                urlLength: lastNormalized?.urlLength ?? null,
                timedOut: error.code === "timeout",
                responseStatus: null,
                apiFormat: "responses" as const,
              } satisfies OpenAiVisionErrorDetails)
            : null;

          if (
            details &&
            attempt < VISION_MAX_ATTEMPTS &&
            shouldFallbackOpenAiFailure(details)
          ) {
            if (diagnosticId) {
              appendVisionDiagnosticStage(diagnosticId, "vision_response", false, {
                attempt,
                normalizeProfile: profile,
                fallbackNext: true,
                errorCode: error.code,
                openaiErrorCode: details.openaiErrorCode,
                safeMessage: details.safeMessage,
              });
            }
            if (isRetryableOpenAiFailure(details)) {
              await sleep(visionRetryDelayMs(attempt));
            }
            continue;
          }

          if (attempt >= VISION_MAX_ATTEMPTS) {
            throw error;
          }
          if (error.code === "config_missing" || error.code === "forbidden") {
            throw error;
          }
          continue;
        }

        const details = extractOpenAiVisionErrorDetails(error, {
          model,
          inputTypes: [...RESPONSES_INPUT_TYPES],
          mimeType: lastNormalized?.mimeType ?? null,
          imageByteLength: lastNormalized?.byteLength ?? null,
          base64Length: lastNormalized?.base64Length ?? null,
          imageCount: 1,
          urlLength: lastNormalized?.urlLength ?? null,
        });
        const mapped = classifyTransportFailure(details, diagnosticId, error);
        logVisionResponseFailure(diagnosticId, details, mapped.code, {
          attempt,
          normalizeProfile: profile,
        });
        lastError = mapped;
        if (
          attempt < VISION_MAX_ATTEMPTS &&
          shouldFallbackOpenAiFailure(details)
        ) {
          if (isRetryableOpenAiFailure(details)) {
            await sleep(visionRetryDelayMs(attempt));
          }
          continue;
        }
        throw mapped;
      }
    }

    throw (
      lastError ??
      new VisionError("openai_failed", "画像解析に失敗しました", {
        diagnosticId,
        failedStage: "vision_response",
      })
    );
  },
};

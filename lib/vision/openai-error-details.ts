import "server-only";

import { APIError, APIConnectionTimeoutError } from "openai";

/**
 * Safe OpenAI / transport error fields for vision diagnostics.
 * Never includes API keys or raw image bytes.
 */
export type OpenAiVisionErrorDetails = {
  httpStatus: number | null;
  openaiErrorType: string | null;
  openaiErrorCode: string | null;
  param: string | null;
  requestId: string | null;
  /** OpenAI error.message (secrets redacted, not collapsed to generic). */
  safeMessage: string | null;
  /** Full OpenAI error JSON body (secrets/data-URLs redacted). */
  rawErrorBody: string | null;
  model: string | null;
  inputTypes: string[];
  mimeType: string | null;
  imageByteLength: number | null;
  base64Length: number | null;
  imageCount: number | null;
  urlLength: number | null;
  timedOut: boolean;
  responseStatus: string | null;
  apiFormat: "responses";
};

export type VisionImageSendMetrics = {
  mimeType: string | null;
  imageByteLength: number | null;
  base64Length: number | null;
  imageCount: number;
  urlLength: number;
};

/** Redact data-URL / http(s) image payloads while preserving length for diagnosis. */
export function redactImageUrlForLog(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("data:")) {
    const comma = imageUrl.indexOf(",");
    const header = comma >= 0 ? imageUrl.slice(0, comma) : "data:image";
    const payloadLen = comma >= 0 ? imageUrl.length - comma - 1 : 0;
    return `${header},[base64_redacted length=${payloadLen}]`;
  }
  if (/^https?:\/\//i.test(imageUrl)) {
    try {
      const url = new URL(imageUrl);
      return `${url.origin}${url.pathname}?[query_redacted] (urlLength=${imageUrl.length})`;
    } catch {
      return `[url_redacted length=${imageUrl.length}]`;
    }
  }
  return `[image_ref_redacted length=${imageUrl.length}]`;
}

export function inspectVisionDataUrl(imageUrl: string): VisionImageSendMetrics {
  const urlLength = imageUrl.length;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/i.exec(
    imageUrl,
  );
  if (!match) {
    return {
      mimeType: null,
      imageByteLength: null,
      base64Length: null,
      imageCount: 1,
      urlLength,
    };
  }
  const mimeType = match[1] ?? null;
  const base64 = (match[2] ?? "").replace(/\s+/g, "");
  let imageByteLength: number | null = null;
  try {
    imageByteLength = Buffer.from(base64, "base64").byteLength;
  } catch {
    imageByteLength = Math.floor((base64.length * 3) / 4);
  }
  return {
    mimeType,
    imageByteLength,
    base64Length: base64.length,
    imageCount: 1,
    urlLength,
  };
}

function readStringProp(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readNumberProp(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object") return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** Strip secrets / image bytes from OpenAI messages — keep full diagnostic text. */
export function sanitizeOpenAiMessage(message: string | null | undefined): string | null {
  if (!message?.trim()) return null;
  return message
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(
      /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi,
      "data:image/…;base64,[redacted]",
    )
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 8_000);
}

function sanitizeJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeOpenAiMessage(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (
        /image_url|file_data|b64_json|base64/i.test(key) &&
        typeof nested === "string"
      ) {
        out[key] = redactImageUrlForLog(nested);
        continue;
      }
      out[key] = sanitizeJsonValue(nested);
    }
    return out;
  }
  return value;
}

/** Serialize OpenAI error / response error object for full-body storage. */
export function serializeOpenAiErrorBody(error: unknown): string | null {
  if (error == null) return null;

  if (error instanceof APIError) {
    const body = {
      status: error.status ?? null,
      type: error.type ?? null,
      code: error.code ?? null,
      message: error.message ?? null,
      param: error.param ?? null,
      request_id: error.requestID ?? null,
      error:
        error.error && typeof error.error === "object"
          ? error.error
          : error.error ?? null,
    };
    try {
      return JSON.stringify(sanitizeJsonValue(body)).slice(0, 16_000);
    } catch {
      return sanitizeOpenAiMessage(error.message);
    }
  }

  if (typeof error === "string") {
    return sanitizeOpenAiMessage(error);
  }

  if (typeof error === "object") {
    try {
      return JSON.stringify(sanitizeJsonValue(error)).slice(0, 16_000);
    } catch {
      return error instanceof Error
        ? sanitizeOpenAiMessage(error.message)
        : "unserializable_error";
    }
  }

  return sanitizeOpenAiMessage(String(error));
}

/** Extract OpenAI SDK / Responses error fields without secrets. */
export function extractOpenAiVisionErrorDetails(
  error: unknown,
  context: {
    model: string;
    inputTypes: string[];
    mimeType: string | null;
    imageByteLength: number | null;
    base64Length: number | null;
    imageCount?: number | null;
    urlLength?: number | null;
    timedOut?: boolean;
    responseStatus?: string | null;
  },
): OpenAiVisionErrorDetails {
  const base: OpenAiVisionErrorDetails = {
    httpStatus: null,
    openaiErrorType: null,
    openaiErrorCode: null,
    param: null,
    requestId: null,
    safeMessage: null,
    rawErrorBody: serializeOpenAiErrorBody(error),
    model: context.model,
    inputTypes: context.inputTypes,
    mimeType: context.mimeType,
    imageByteLength: context.imageByteLength,
    base64Length: context.base64Length,
    imageCount: context.imageCount ?? 1,
    urlLength: context.urlLength ?? null,
    timedOut: context.timedOut === true,
    responseStatus: context.responseStatus ?? null,
    apiFormat: "responses",
  };

  if (error instanceof APIConnectionTimeoutError) {
    return {
      ...base,
      timedOut: true,
      openaiErrorType: "APIConnectionTimeoutError",
      safeMessage: sanitizeOpenAiMessage(error.message),
    };
  }

  if (error instanceof APIError) {
    const nested =
      error.error && typeof error.error === "object" ? error.error : null;
    return {
      ...base,
      httpStatus: typeof error.status === "number" ? error.status : null,
      openaiErrorType:
        error.type ??
        readStringProp(nested, "type") ??
        error.constructor?.name ??
        "APIError",
      openaiErrorCode:
        (typeof error.code === "string" ? error.code : null) ??
        readStringProp(nested, "code"),
      param:
        (typeof error.param === "string" ? error.param : null) ??
        readStringProp(nested, "param"),
      requestId:
        (typeof error.requestID === "string" ? error.requestID : null) ??
        readStringProp(error, "request_id"),
      safeMessage: sanitizeOpenAiMessage(
        readStringProp(nested, "message") ?? error.message,
      ),
      timedOut:
        base.timedOut ||
        /timeout|timed out/i.test(error.message) ||
        error.status === 408,
    };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const nested =
      record.error && typeof record.error === "object" ? record.error : null;
    return {
      ...base,
      httpStatus:
        readNumberProp(record, "status") ?? readNumberProp(record, "statusCode"),
      openaiErrorType:
        readStringProp(record, "type") ??
        readStringProp(nested, "type") ??
        readStringProp(record, "name"),
      openaiErrorCode:
        readStringProp(record, "code") ?? readStringProp(nested, "code"),
      param: readStringProp(record, "param") ?? readStringProp(nested, "param"),
      requestId:
        readStringProp(record, "requestID") ??
        readStringProp(record, "request_id") ??
        readStringProp(nested, "request_id"),
      safeMessage: sanitizeOpenAiMessage(
        readStringProp(nested, "message") ??
          (error instanceof Error ? error.message : null),
      ),
      timedOut:
        base.timedOut ||
        Boolean(
          readStringProp(record, "message") &&
            /timeout|timed out/i.test(String(record.message)),
        ),
    };
  }

  if (error instanceof Error) {
    return {
      ...base,
      openaiErrorType: error.name || "Error",
      safeMessage: sanitizeOpenAiMessage(error.message),
      timedOut: base.timedOut || /timeout|timed out/i.test(error.message),
    };
  }

  return {
    ...base,
    openaiErrorType: "unknown",
    safeMessage: "unknown_error",
  };
}

export function openAiDetailsForLog(
  details: OpenAiVisionErrorDetails,
): Record<string, string | number | boolean | null> {
  return {
    httpStatus: details.httpStatus,
    openaiErrorType: details.openaiErrorType,
    openaiErrorCode: details.openaiErrorCode,
    param: details.param,
    requestId: details.requestId,
    safeMessage: details.safeMessage,
    rawErrorBody: details.rawErrorBody,
    model: details.model,
    inputTypes: details.inputTypes.join(","),
    mimeType: details.mimeType,
    imageByteLength: details.imageByteLength,
    base64Length: details.base64Length,
    imageCount: details.imageCount,
    urlLength: details.urlLength,
    timedOut: details.timedOut,
    responseStatus: details.responseStatus,
    apiFormat: details.apiFormat,
  };
}

/**
 * Log-safe Responses API request snapshot.
 * Includes required diagnostic fields; image bytes are always redacted.
 */
export function buildVisionOpenAiRequestLog(input: {
  model: string;
  instructions?: string | null;
  multimodalInput: Array<{
    role: string;
    content: Array<Record<string, unknown>>;
  }>;
  tools?: unknown;
  responseFormat?: unknown;
  maxOutputTokens?: number | null;
  imageMetrics: VisionImageSendMetrics;
  detail: string;
  diagnosticId?: string | null;
  jobId?: string | null;
  vercelRequestId?: string | null;
}): Record<string, unknown> {
  const redactedInput = input.multimodalInput.map((message) => ({
    role: message.role,
    content: message.content.map((part) => {
      if (part.type === "input_image") {
        return {
          type: "input_image",
          detail: part.detail ?? null,
          image_url: redactImageUrlForLog(
            typeof part.image_url === "string" ? part.image_url : null,
          ),
          file_id: typeof part.file_id === "string" ? part.file_id : null,
        };
      }
      if (part.type === "input_text") {
        const text = typeof part.text === "string" ? part.text : "";
        return {
          type: "input_text",
          text: text.slice(0, 2_000),
          textLength: text.length,
        };
      }
      return { type: part.type ?? "unknown" };
    }),
  }));

  const imagePart = input.multimodalInput
    .flatMap((m) => m.content)
    .find((part) => part.type === "input_image");

  return {
    diagnosticId: input.diagnosticId ?? null,
    jobId: input.jobId ?? null,
    vercelRequestId: input.vercelRequestId ?? null,
    apiFormat: "responses",
    model: input.model,
    input: redactedInput,
    // Responses API uses `input`, not Chat Completions `messages`.
    messages: null,
    image_url: redactImageUrlForLog(
      typeof imagePart?.image_url === "string" ? imagePart.image_url : null,
    ),
    tools: input.tools ?? null,
    response_format: input.responseFormat ?? null,
    max_output_tokens: input.maxOutputTokens ?? null,
    instructionsPreview: (input.instructions ?? "").slice(0, 400),
    imageMetrics: {
      imageCount: input.imageMetrics.imageCount,
      mimeType: input.imageMetrics.mimeType,
      imageByteLength: input.imageMetrics.imageByteLength,
      base64Length: input.imageMetrics.base64Length,
      urlLength: input.imageMetrics.urlLength,
      detail: input.detail,
    },
    visionInputSpec: {
      contentTypes: ["input_text", "input_image"],
      imageUrlField: "image_url",
      matchesOfficialResponsesApi: true,
    },
  };
}

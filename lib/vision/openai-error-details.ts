import "server-only";

import { APIError, APIConnectionTimeoutError } from "openai";

/**
 * Safe OpenAI / transport error fields for vision diagnostics.
 * Never includes API keys, image bytes, or full request bodies.
 */
export type OpenAiVisionErrorDetails = {
  httpStatus: number | null;
  openaiErrorType: string | null;
  openaiErrorCode: string | null;
  param: string | null;
  requestId: string | null;
  safeMessage: string | null;
  model: string | null;
  inputTypes: string[];
  mimeType: string | null;
  imageByteLength: number | null;
  base64Length: number | null;
  timedOut: boolean;
  responseStatus: string | null;
  apiFormat: "responses";
};

export function inspectVisionDataUrl(imageUrl: string): {
  mimeType: string | null;
  imageByteLength: number | null;
  base64Length: number | null;
} {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/i.exec(
    imageUrl,
  );
  if (!match) {
    return { mimeType: null, imageByteLength: null, base64Length: null };
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

/** Extract OpenAI SDK / Responses error fields without secrets. */
export function extractOpenAiVisionErrorDetails(
  error: unknown,
  context: {
    model: string;
    inputTypes: string[];
    mimeType: string | null;
    imageByteLength: number | null;
    base64Length: number | null;
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
    model: context.model,
    inputTypes: context.inputTypes,
    mimeType: context.mimeType,
    imageByteLength: context.imageByteLength,
    base64Length: context.base64Length,
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

/** Strip likely secrets / oversized payloads from OpenAI messages before logging. */
export function sanitizeOpenAiMessage(message: string | null | undefined): string | null {
  if (!message?.trim()) return null;
  return message
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "data:image/…;base64,[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
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
    model: details.model,
    inputTypes: details.inputTypes.join(","),
    mimeType: details.mimeType,
    imageByteLength: details.imageByteLength,
    base64Length: details.base64Length,
    timedOut: details.timedOut,
    responseStatus: details.responseStatus,
    apiFormat: details.apiFormat,
  };
}

import "server-only";

import type { OpenAiVisionErrorDetails } from "@/lib/vision/openai-error-details";

export const VISION_MAX_ATTEMPTS = 3;

export function isRetryableOpenAiFailure(details: OpenAiVisionErrorDetails): boolean {
  const status = details.httpStatus;
  if (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return true;
  }
  if (details.timedOut) return true;
  const code = (details.openaiErrorCode ?? "").toLowerCase();
  const message = (details.safeMessage ?? "").toLowerCase();
  if (
    code === "rate_limit_exceeded" ||
    code === "server_error" ||
    code === "timeout" ||
    /timeout|timed out|econnreset|socket hang up|temporarily unavailable|overloaded/i.test(
      message,
    )
  ) {
    return true;
  }
  return false;
}

/** Do not retry auth / bad request / corrupt image / unsupported model. */
export function isNonRetryableOpenAiFailure(
  details: OpenAiVisionErrorDetails,
): boolean {
  const status = details.httpStatus;
  if (status === 401 || status === 403 || status === 404) return true;
  const code = (details.openaiErrorCode ?? "").toLowerCase();
  if (
    code === "invalid_api_key" ||
    code === "invalid_image" ||
    code === "invalid_image_format" ||
    code === "invalid_request_error" ||
    code === "model_not_found" ||
    code === "unsupported_value"
  ) {
    // invalid_request may still be retryable with different payload — handled by fallback path.
    if (code === "invalid_request_error") return false;
    if (code === "invalid_image" || code === "invalid_image_format") {
      // Retrying same bytes is useless; caller should re-encode (fallback path).
      return false;
    }
    return true;
  }
  if (
    details.openaiErrorType === "invalid_request_error" &&
    /api key|model.*not|does not exist|unsupported/i.test(
      details.safeMessage ?? "",
    )
  ) {
    return true;
  }
  return false;
}

/** Malformed model JSON / schema mismatch must not be re-sent to OpenAI. */
export function isNonRetryableVisionParseFailure(
  code: string | null | undefined,
): boolean {
  return code === "json_parse_failed" || code === "table_extract_failed";
}

/** Whether a fallback attempt with re-encode / other model is warranted. */
export function shouldFallbackOpenAiFailure(
  details: OpenAiVisionErrorDetails,
): boolean {
  if (isRetryableOpenAiFailure(details)) return true;
  const code = (details.openaiErrorCode ?? "").toLowerCase();
  const message = (details.safeMessage ?? "").toLowerCase();
  if (
    code === "invalid_image" ||
    code === "invalid_image_format" ||
    code === "empty_content" ||
    code === "model_not_found" ||
    /image could not be processed|invalid image|could not process|empty output|incomplete/i.test(
      message,
    )
  ) {
    return true;
  }
  if (details.httpStatus === 400) return true;
  return false;
}

export function visionRetryDelayMs(attempt: number): number {
  // attempt 1→2, 2→3 : exponential backoff + jitter
  const base = 400 * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(base + jitter, 4_000);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

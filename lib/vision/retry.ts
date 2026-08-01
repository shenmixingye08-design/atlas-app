import "server-only";

import type { OpenAiVisionErrorDetails } from "@/lib/vision/openai-error-details";

/** Max attempts: 1 initial + up to 2 more for non-timeout (total 3). */
export const VISION_MAX_ATTEMPTS = 3;

/**
 * Timeout / network / 429 / 5xx path: 1 initial + up to 3 retries.
 * Delays before retries: 2s → 5s → 10s.
 */
export const VISION_TIMEOUT_MAX_ATTEMPTS = 4;

/** Fixed backoff before retry after failed attempt 1/2/3. */
export const VISION_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;

/** @deprecated Use VISION_RETRY_DELAYS_MS — kept for PR#77 compatibility. */
export const VISION_TIMEOUT_RETRY_DELAYS_MS = VISION_RETRY_DELAYS_MS;

/**
 * Retry only timeout, network errors, 429, and 5xx.
 * Never auto-retry 400-class input errors.
 */
export function isRetryableOpenAiFailure(details: OpenAiVisionErrorDetails): boolean {
  const status = details.httpStatus;
  if (status != null && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return false;
  }
  if (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return true;
  }
  if (details.timedOut) return true;
  if (
    details.openaiErrorType === "APIConnectionError" ||
    details.openaiErrorType === "APIConnectionTimeoutError"
  ) {
    return true;
  }
  const code = (details.openaiErrorCode ?? "").toLowerCase();
  const message = (details.safeMessage ?? "").toLowerCase();
  if (
    code === "rate_limit_exceeded" ||
    code === "server_error" ||
    code === "timeout" ||
    /timeout|timed out|econnreset|socket hang up|temporarily unavailable|overloaded|network|fetch failed|aborted/i.test(
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
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
    return true;
  }
  const code = (details.openaiErrorCode ?? "").toLowerCase();
  if (
    code === "invalid_api_key" ||
    code === "invalid_image" ||
    code === "invalid_image_format" ||
    code === "invalid_request_error" ||
    code === "model_not_found" ||
    code === "unsupported_value"
  ) {
    return true;
  }
  if (
    details.openaiErrorType === "invalid_request_error" ||
    details.openaiErrorType === "BadRequestError"
  ) {
    return true;
  }
  return false;
}

/**
 * Whether a fallback attempt with re-encode / other model is warranted.
 * 400-class input errors are NOT retried (caller must fail fast).
 */
export function shouldFallbackOpenAiFailure(
  details: OpenAiVisionErrorDetails,
): boolean {
  if (isNonRetryableOpenAiFailure(details)) return false;
  return isRetryableOpenAiFailure(details);
}

/**
 * Delay after a failed attempt before the next try.
 * attempt 1→2s, 2→5s, 3→10s.
 */
export function visionRetryDelayMs(failedAttempt: number): number {
  const index = Math.min(
    Math.max(failedAttempt, 1),
    VISION_RETRY_DELAYS_MS.length,
  ) - 1;
  return VISION_RETRY_DELAYS_MS[index] ?? 10_000;
}

/** Alias used by timeout-specific call sites. */
export function visionTimeoutRetryDelayMs(failedAttempt: number): number {
  return visionRetryDelayMs(failedAttempt);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

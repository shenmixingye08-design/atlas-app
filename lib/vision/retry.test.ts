import { describe, expect, it } from "vitest";

import {
  isNonRetryableOpenAiFailure,
  isRetryableOpenAiFailure,
  shouldFallbackOpenAiFailure,
  visionMaxAttemptsForFailure,
  visionTimeoutRetryDelayMs,
  VISION_TIMEOUT_MAX_ATTEMPTS,
  VISION_TIMEOUT_RETRY_DELAYS_MS,
} from "@/lib/vision/retry";
import type { OpenAiVisionErrorDetails } from "@/lib/vision/openai-error-details";

function details(
  partial: Partial<OpenAiVisionErrorDetails>,
): OpenAiVisionErrorDetails {
  return {
    httpStatus: null,
    openaiErrorType: null,
    openaiErrorCode: null,
    param: null,
    requestId: null,
    safeMessage: null,
    rawErrorBody: null,
    model: "gpt-5.5",
    inputTypes: ["input_text", "input_image"],
    mimeType: "image/jpeg",
    imageByteLength: 1000,
    base64Length: 1400,
    imageCount: 1,
    urlLength: 1500,
    timedOut: false,
    responseStatus: null,
    apiFormat: "responses",
    ...partial,
  };
}

describe("vision retry policy", () => {
  it("retries 429/500/timeout", () => {
    expect(isRetryableOpenAiFailure(details({ httpStatus: 429 }))).toBe(true);
    expect(isRetryableOpenAiFailure(details({ httpStatus: 500 }))).toBe(true);
    expect(isRetryableOpenAiFailure(details({ timedOut: true }))).toBe(true);
    expect(
      isRetryableOpenAiFailure(
        details({ openaiErrorCode: "rate_limit_exceeded" }),
      ),
    ).toBe(true);
  });

  it("does not blindly retry auth failures", () => {
    expect(
      isNonRetryableOpenAiFailure(
        details({ httpStatus: 401, openaiErrorCode: "invalid_api_key" }),
      ),
    ).toBe(true);
  });

  it("falls back (re-encode / model) for invalid_image and empty content", () => {
    expect(
      shouldFallbackOpenAiFailure(
        details({
          httpStatus: 400,
          openaiErrorCode: "invalid_image",
          safeMessage: "Image could not be processed",
        }),
      ),
    ).toBe(true);
    expect(
      shouldFallbackOpenAiFailure(
        details({ openaiErrorCode: "empty_content" }),
      ),
    ).toBe(true);
  });

  it("uses fixed 2s/5s/10s delays and 4 attempts for timeout", () => {
    expect(VISION_TIMEOUT_RETRY_DELAYS_MS).toEqual([2000, 5000, 10000]);
    expect(visionTimeoutRetryDelayMs(1)).toBe(2000);
    expect(visionTimeoutRetryDelayMs(2)).toBe(5000);
    expect(visionTimeoutRetryDelayMs(3)).toBe(10000);
    expect(visionMaxAttemptsForFailure({ timedOut: true })).toBe(
      VISION_TIMEOUT_MAX_ATTEMPTS,
    );
    expect(VISION_TIMEOUT_MAX_ATTEMPTS).toBe(4);
  });
});

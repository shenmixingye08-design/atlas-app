import { describe, expect, it } from "vitest";

import {
  classifyRetryError,
  computeNextRetryAt,
  RETRY_BACKOFF_MS,
} from "@/lib/jobs/retry-classifier";

describe("retry-classifier", () => {
  it("does not retry OAuth / 400 / validation errors", () => {
    expect(classifyRetryError(new Error("OAuth token expired"))).toBe(
      "non_retryable",
    );
    expect(classifyRetryError(new Error("HTTP 400 bad request"))).toBe(
      "non_retryable",
    );
    expect(classifyRetryError(new Error("validation failed"))).toBe(
      "non_retryable",
    );
    expect(classifyRetryError(new Error("permission denied"))).toBe(
      "non_retryable",
    );
  });

  it("retries timeout / 429 / 5xx / storage / DB errors", () => {
    expect(classifyRetryError(new Error("Request timeout ETIMEDOUT"))).toBe(
      "retryable",
    );
    expect(classifyRetryError(new Error("429 rate limit"))).toBe("retryable");
    expect(classifyRetryError(new Error("503 Service Unavailable"))).toBe(
      "retryable",
    );
    expect(classifyRetryError(new Error("supabase storage temporarily down"))).toBe(
      "retryable",
    );
    expect(classifyRetryError(new Error("database connection pool exhausted"))).toBe(
      "retryable",
    );
  });

  it("uses 1m/5m/15m backoff bases with jitter", () => {
    const t1 = new Date(computeNextRetryAt(1, 0)).getTime();
    const t2 = new Date(computeNextRetryAt(2, 0)).getTime();
    const t3 = new Date(computeNextRetryAt(3, 0)).getTime();
    expect(t1).toBeGreaterThanOrEqual(Math.floor(RETRY_BACKOFF_MS[0]! * 0.1));
    expect(t1).toBeLessThanOrEqual(RETRY_BACKOFF_MS[0]!);
    expect(t2).toBeGreaterThanOrEqual(Math.floor(RETRY_BACKOFF_MS[1]! * 0.1));
    expect(t2).toBeLessThanOrEqual(RETRY_BACKOFF_MS[1]!);
    expect(t3).toBeGreaterThanOrEqual(Math.floor(RETRY_BACKOFF_MS[2]! * 0.1));
    expect(t3).toBeLessThanOrEqual(RETRY_BACKOFF_MS[2]!);
  });
});

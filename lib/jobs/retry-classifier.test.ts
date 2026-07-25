import { describe, expect, it } from "vitest";

import {
  classifyRetryError,
  computeNextRetryAt,
  RETRY_BACKOFF_MS,
} from "@/lib/jobs/retry-classifier";

describe("retry-classifier", () => {
  it("does not retry OAuth errors", () => {
    expect(classifyRetryError(new Error("OAuth token expired"))).toBe("non_retryable");
  });

  it("retries timeout errors", () => {
    expect(classifyRetryError(new Error("Request timeout ETIMEDOUT"))).toBe("retryable");
  });

  it("uses 1m/5m/15m backoff", () => {
    const t1 = new Date(computeNextRetryAt(1, 0)).getTime();
    const t2 = new Date(computeNextRetryAt(2, 0)).getTime();
    const t3 = new Date(computeNextRetryAt(3, 0)).getTime();
    expect(t1).toBe(RETRY_BACKOFF_MS[0]);
    expect(t2).toBe(RETRY_BACKOFF_MS[1]);
    expect(t3).toBe(RETRY_BACKOFF_MS[2]);
  });
});

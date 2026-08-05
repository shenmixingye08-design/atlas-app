import { describe, expect, it } from "vitest";

import {
  classifyIntegrationError,
  computeBackoffDelayMs,
  IntegrationHttpError,
  withIntegrationRetry,
} from "./retry";

describe("integration production retry", () => {
  it("classifies 429 / 5xx / timeout / network", () => {
    expect(classifyIntegrationError(new IntegrationHttpError(429, "rl"))).toBe(
      "retryable_429",
    );
    expect(classifyIntegrationError(new IntegrationHttpError(503, "down"))).toBe(
      "retryable_5xx",
    );
    expect(classifyIntegrationError(new Error("Request timed out"))).toBe(
      "retryable_timeout",
    );
    expect(classifyIntegrationError(new Error("fetch failed"))).toBe(
      "retryable_network",
    );
    expect(classifyIntegrationError(new IntegrationHttpError(400, "bad"))).toBe(
      "non_retryable",
    );
  });

  it("applies exponential backoff with jitter", () => {
    const delay = computeBackoffDelayMs({
      attempt: 3,
      baseDelayMs: 100,
      maxDelayMs: 10_000,
      classification: "retryable_5xx",
      random: () => 0.5,
    });
    expect(delay).toBeGreaterThan(400);
    expect(delay).toBeLessThanOrEqual(10_000);
  });

  it("does not retry non-retryable errors", async () => {
    let attempts = 0;
    await expect(
      withIntegrationRetry(
        async () => {
          attempts += 1;
          throw new IntegrationHttpError(400, "bad request");
        },
        { maxAttempts: 4, sleep: async () => undefined },
      ),
    ).rejects.toThrow("bad request");
    expect(attempts).toBe(1);
  });

  it("retries 429 then succeeds", async () => {
    let attempts = 0;
    const result = await withIntegrationRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new IntegrationHttpError(429, "slow down", { retryAfterMs: 1 });
        }
        return "ok";
      },
      { maxAttempts: 3, sleep: async () => undefined, random: () => 0 },
    );
    expect(result.value).toBe("ok");
    expect(result.attempts).toBe(2);
  });
});

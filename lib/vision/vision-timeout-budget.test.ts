import { describe, expect, it } from "vitest";

import {
  resolveVisionAttemptTimeoutMs,
  VISION_LARGE_PAYLOAD_BYTES,
  VISION_OPENAI_TIMEOUT_MS,
  VISION_TOTAL_OPENAI_BUDGET_MS,
} from "./openai-vision-provider";
import { normalizeProfileForAttempt } from "./normalize-for-openai";

describe("vision timeout recurrence controls", () => {
  it("keeps per-attempt timeout under serverless-safe budgets", () => {
    expect(VISION_OPENAI_TIMEOUT_MS).toBeLessThanOrEqual(55_000);
    expect(VISION_TOTAL_OPENAI_BUDGET_MS).toBeLessThanOrEqual(180_000);
    expect(VISION_TOTAL_OPENAI_BUDGET_MS).toBeGreaterThan(
      VISION_OPENAI_TIMEOUT_MS,
    );
  });

  it("tightens timeout on later attempts and large payloads", () => {
    const attempt1 = resolveVisionAttemptTimeoutMs({
      attempt: 1,
      remainingBudgetMs: 120_000,
      imageByteLength: 100_000,
    });
    const attempt3 = resolveVisionAttemptTimeoutMs({
      attempt: 3,
      remainingBudgetMs: 120_000,
      imageByteLength: 100_000,
    });
    const large = resolveVisionAttemptTimeoutMs({
      attempt: 1,
      remainingBudgetMs: 120_000,
      imageByteLength: VISION_LARGE_PAYLOAD_BYTES + 1,
    });
    expect(attempt1).toBe(VISION_OPENAI_TIMEOUT_MS);
    expect(attempt3).toBeLessThan(attempt1);
    expect(large).toBeLessThanOrEqual(35_000);
  });

  it("never schedules more than remaining budget", () => {
    const t = resolveVisionAttemptTimeoutMs({
      attempt: 1,
      remainingBudgetMs: 8_000,
      imageByteLength: 50_000,
    });
    expect(t).toBe(8_000);
  });

  it("forces compact normalize for large source images", () => {
    expect(
      normalizeProfileForAttempt(1, true, {
        sourceByteLength: 3_000_000,
      }),
    ).toBe("compact");
    expect(
      normalizeProfileForAttempt(1, true, { forceCompact: true }),
    ).toBe("compact");
    expect(normalizeProfileForAttempt(1, true)).toBe("ocr");
  });
});

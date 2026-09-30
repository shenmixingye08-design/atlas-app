import { describe, expect, it } from "vitest";

import {
  X_SAMPLE_ATTEMPT_LIMIT,
  X_SAMPLE_POST_TYPE,
  X_SAMPLE_RATE_LIMIT,
  buildSampleSettings,
  parseXSampleInput,
} from "./autopost-sample";

describe("X pre-connect sample", () => {
  it("requires a short non-empty theme", () => {
    expect(parseXSampleInput({ theme: "  " })).toBeNull();
    expect(parseXSampleInput({ theme: "あ".repeat(61) })).toBeNull();
    expect(parseXSampleInput(null)).toBeNull();
    expect(parseXSampleInput({ theme: " 副業 ", audience: "会社員" })).toEqual({
      theme: "副業",
      audience: "会社員",
    });
  });

  it("builds transient, disabled settings (never auto-posts)", () => {
    const settings = buildSampleSettings("u1", { theme: "副業" });
    expect(settings.enabled).toBe(false);
    expect(settings.mode).toBe("approval");
    expect(settings.themes).toEqual(["副業"]);
  });

  it("caps samples per user per day, with a hard attempt ceiling", () => {
    expect(X_SAMPLE_RATE_LIMIT.max).toBeLessThanOrEqual(3);
    expect(X_SAMPLE_RATE_LIMIT.windowMs).toBe(24 * 60 * 60 * 1000);
    expect(X_SAMPLE_ATTEMPT_LIMIT.max).toBeLessThanOrEqual(6);
    expect(X_SAMPLE_ATTEMPT_LIMIT.max).toBeGreaterThan(X_SAMPLE_RATE_LIMIT.max);
  });

  it("uses the substantive tip format for the first impression", () => {
    expect(X_SAMPLE_POST_TYPE).toBe("knowhow");
  });
});

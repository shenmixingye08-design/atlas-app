import { describe, expect, it } from "vitest";

import {
  classifyFailure,
  failureClassCause,
  failureClassLabel,
  isRetryableFailureClass,
} from "./error-classification";

describe("error classification", () => {
  it("classifies required failure kinds", () => {
    expect(classifyFailure("OpenAI API error: model_error")).toBe("openai");
    expect(classifyFailure("network ECONNRESET")).toBe("network");
    expect(classifyFailure("Request timed out")).toBe("timeout");
    expect(classifyFailure("Invalid JSON payload")).toBe("json_parse");
    expect(classifyFailure("project upsert failed / 保存に失敗")).toBe(
      "save_failure",
    );
    expect(classifyFailure("成果物の生成に失敗しました")).toBe(
      "generation_failure",
    );
  });

  it("exposes Japanese labels (never generic 処理できませんでした)", () => {
    for (const value of [
      "openai",
      "network",
      "timeout",
      "json_parse",
      "save_failure",
      "generation_failure",
    ] as const) {
      expect(failureClassLabel(value)).not.toMatch(/処理できませんでした/);
      expect(failureClassCause(value)).not.toMatch(/処理できませんでした/);
      expect(isRetryableFailureClass(value)).toBe(true);
    }
  });

  it("does not retry auth / cancel", () => {
    expect(isRetryableFailureClass(classifyFailure("unauthorized oauth"))).toBe(
      false,
    );
    expect(isRetryableFailureClass(classifyFailure("Cancelled by user"))).toBe(
      false,
    );
  });
});

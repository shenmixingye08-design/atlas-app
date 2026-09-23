import { describe, expect, it } from "vitest";

import { describeActionError, describeRunNowResult } from "./run-now-feedback";

describe("describeRunNowResult", () => {
  it("reports completion with deliverable count", () => {
    expect(describeRunNowResult({ status: "completed", error: null, deliverableCount: 2 })).toEqual({
      tone: "success",
      message: "完了しました。成果物2件をお届けしました",
    });
  });

  it("never reports success for failed or awaiting runs", () => {
    expect(describeRunNowResult({ status: "failed", error: "timeout", deliverableCount: 0 }).tone).toBe(
      "error",
    );
    expect(
      describeRunNowResult({ status: "awaiting_approval", error: null, deliverableCount: 0 }).tone,
    ).toBe("warning");
  });

  it("uses the thrown message or a fallback", () => {
    expect(describeActionError(new Error("権限がありません"), "x").message).toBe("権限がありません");
    expect(describeActionError("boom", "更新できませんでした").message).toBe("更新できませんでした");
  });
});

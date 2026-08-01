import { describe, expect, it } from "vitest";

import { VisionError } from "@/lib/vision/types";
import { userMessageForVisionFailure } from "@/lib/vision/user-error";
import { visionPhaseForError } from "@/lib/vision/job-phase";

/**
 * Regression: vision_openai_timeout must never surface as needs_input.
 */
describe("timeout vs needs_input separation", () => {
  it("timeout user copy is temporary, not missing-fields", () => {
    const message = userMessageForVisionFailure({
      code: "timeout",
      failedStage: "vision_response",
      openaiMessage: "vision_openai_timeout",
      httpStatus: 408,
    });
    expect(message).toMatch(/時間切れ|再解析/);
    expect(message).not.toMatch(/該当情報|必須項目/);
  });

  it("timeout VisionError code stays timeout", () => {
    const error = new VisionError("timeout", "vision_openai_timeout", {
      failedStage: "vision_response",
      details: {
        safeMessage: "vision_openai_timeout",
        openaiErrorCode: "timeout",
        timedOut: true,
      },
    });
    expect(error.code).toBe("timeout");
    expect(visionPhaseForError({ code: error.code })).toBe("failed");
    expect(visionPhaseForError({ code: error.code })).not.toBe("needs_input");
  });

  it("needs_input phase only when analysis succeeded without fields", () => {
    expect(visionPhaseForError({ gateStatus: "needs_input" })).toBe(
      "needs_input",
    );
    expect(
      visionPhaseForError({ code: "timeout", gateStatus: "needs_input" }),
    ).toBe("failed");
  });
});

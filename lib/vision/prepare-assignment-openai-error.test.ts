import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vision/analyze-batch", () => ({
  analyzeUserImageBatch: vi.fn(),
}));

import { analyzeUserImageBatch } from "@/lib/vision/analyze-batch";
import { resetVisionDiagnosticsForTests } from "@/lib/vision/diagnostics";
import { prepareAssignmentWithVision } from "@/lib/vision/prepare-assignment";
import { VisionError } from "@/lib/vision/types";

describe("prepareAssignment OpenAI error surfacing", () => {
  beforeEach(() => {
    resetVisionDiagnosticsForTests();
    vi.mocked(analyzeUserImageBatch).mockReset();
  });

  it("puts OpenAI cause / raw body / request_id on the vision gate", async () => {
    vi.mocked(analyzeUserImageBatch).mockRejectedValue(
      new VisionError("openai_failed", "Image could not be processed", {
        diagnosticId: "vdiag_openai_gate",
        failedStage: "vision_response",
        details: {
          httpStatus: 400,
          openaiErrorType: "invalid_request_error",
          openaiErrorCode: "invalid_image",
          requestId: "req_gate_1",
          safeMessage: "Image could not be processed",
          rawErrorBody:
            '{"status":400,"type":"invalid_request_error","code":"invalid_image","message":"Image could not be processed","request_id":"req_gate_1"}',
          apiFormat: "responses",
        },
      }),
    );

    const prepared = await prepareAssignmentWithVision({
      userId: "user_openai_gate",
      assignment: "このレシートを家計簿にしてください",
      metadata: {
        attachmentIds: ["img_1"],
        jobId: "job_openai_gate",
      },
    });

    expect(prepared.gate).toBeTruthy();
    expect(prepared.gate?.failedStage).toBe("vision_response");
    expect(prepared.gate?.cause).toContain("Image could not be processed");
    expect(prepared.gate?.message).toContain("Image could not be processed");
    expect(prepared.gate?.message).not.toMatch(
      /再試行してください$/,
    );
    expect(prepared.gate?.openai).toMatchObject({
      httpStatus: 400,
      type: "invalid_request_error",
      code: "invalid_image",
      message: "Image could not be processed",
      requestId: "req_gate_1",
    });
    expect(prepared.gate?.openai?.rawErrorBody).toContain("req_gate_1");
    expect(prepared.metadata.visionOpenAiRequestId).toBe("req_gate_1");
  });
});

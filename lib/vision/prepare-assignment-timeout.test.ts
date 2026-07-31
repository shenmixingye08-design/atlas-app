import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vision/analyze-batch", () => ({
  analyzeUserImageBatch: vi.fn(),
}));

import { analyzeUserImageBatch } from "@/lib/vision/analyze-batch";
import { resetVisionDiagnosticsForTests } from "@/lib/vision/diagnostics";
import { prepareAssignmentWithVision } from "@/lib/vision/prepare-assignment";
import { VisionError } from "@/lib/vision/types";
import { VISION_TIMEOUT_USER_MESSAGE } from "@/lib/vision/user-error";

describe("prepareAssignment timeout temporary error", () => {
  beforeEach(() => {
    resetVisionDiagnosticsForTests();
    vi.mocked(analyzeUserImageBatch).mockReset();
  });

  it("treats vision_openai_timeout as temporary_error / reanalyzable", async () => {
    vi.mocked(analyzeUserImageBatch).mockRejectedValue(
      new VisionError("timeout", "vision_openai_timeout", {
        diagnosticId: "vdiag_timeout_gate",
        failedStage: "vision_response",
        details: {
          httpStatus: 408,
          openaiErrorType: "VisionTimeoutError",
          openaiErrorCode: "timeout",
          requestId: "req_timeout_1",
          safeMessage: "vision_openai_timeout",
          rawErrorBody:
            '{"status":408,"type":"VisionTimeoutError","code":"timeout","message":"vision_openai_timeout","request_id":"req_timeout_1"}',
          timedOut: true,
          apiFormat: "responses",
        },
      }),
    );

    const prepared = await prepareAssignmentWithVision({
      userId: "user_timeout_gate",
      assignment: "このレシートを家計簿にしてください",
      metadata: {
        attachmentIds: ["img_timeout"],
        jobId: "job_timeout_gate",
      },
    });

    expect(prepared.gate?.status).toBe("temporary_error");
    expect(prepared.gate?.errorKind).toBe("temporary");
    expect(prepared.gate?.reanalyzable).toBe(true);
    expect(prepared.gate?.developerCode).toBe("timeout");
    expect(prepared.gate?.userCode).toBe("vision_temporary_error");
    expect(prepared.gate?.message).toBe(VISION_TIMEOUT_USER_MESSAGE);
    expect(prepared.gate?.message).not.toContain("画像内に該当情報");
    expect(prepared.gate?.openai).toMatchObject({
      requestId: "req_timeout_1",
      code: "timeout",
      type: "VisionTimeoutError",
    });
    expect(prepared.metadata.visionReanalyzable).toBe(true);
    expect(prepared.metadata.visionErrorKind).toBe("temporary");
  });
});

import { describe, expect, it, beforeEach } from "vitest";

import {
  appendVisionDiagnosticStage,
  createVisionDiagnostic,
  getLatestFailedStage,
  getVisionDiagnosticForUser,
  resetVisionDiagnosticsForTests,
} from "@/lib/vision/diagnostics";
import {
  formatVisionDeveloperHint,
  labelForVisionStage,
  messageForVisionStage,
  stageFromVisionErrorCode,
} from "@/lib/vision/failure-stage";
import { VisionError } from "@/lib/vision/types";
import { prepareAssignmentWithVision } from "@/lib/vision/prepare-assignment";

describe("vision failure stages", () => {
  beforeEach(() => {
    resetVisionDiagnosticsForTests();
  });

  it("maps error codes to pipeline stages", () => {
    expect(stageFromVisionErrorCode("not_found")).toBe("storage_download");
    expect(stageFromVisionErrorCode("invalid_data_url")).toBe("data_url");
    expect(stageFromVisionErrorCode("openai_failed")).toBe("vision_response");
    expect(stageFromVisionErrorCode("json_parse_failed")).toBe(
      "schema_validation",
    );
    expect(stageFromVisionErrorCode("artifact_failed")).toBe(
      "artifact_generation",
    );
  });

  it("provides Japanese labels and messages per stage", () => {
    expect(labelForVisionStage("vision_response")).toBe("AI解析");
    expect(messageForVisionStage("vision_response")).toContain("AI");
    expect(labelForVisionStage("storage_download")).toBe("保存画像の読み込み");
    expect(labelForVisionStage("artifact_generation")).toBe("成果物の作成");
  });

  it("records failed stage and exposes diagnosticId to developers", () => {
    const diag = createVisionDiagnostic({
      userId: "user_diag",
      attachmentId: "img_1",
      jobId: "job_1",
    });
    appendVisionDiagnosticStage(diag.id, "upload", true, {
      payloadAttachmentIdCount: 1,
    });
    appendVisionDiagnosticStage(diag.id, "storage_download", true, {
      downloadedByteLength: 1200,
      mimeType: "image/png",
    });
    appendVisionDiagnosticStage(diag.id, "vision_request", true, {
      inputImageIncluded: true,
      model: "atlas-mock",
    });
    appendVisionDiagnosticStage(diag.id, "vision_response", false, {
      errorCode: "openai_failed",
      userCode: "ai_analyze_failed",
      openaiErrorCode: "openai_failed",
    });

    const stored = getVisionDiagnosticForUser("user_diag", diag.id);
    expect(stored).toBeTruthy();
    expect(getLatestFailedStage(stored!)).toBe("vision_response");
    expect(stored!.lastErrorCode).toBe("openai_failed");
    expect(stored!.lastUserCode).toBe("ai_analyze_failed");

    const hint = formatVisionDeveloperHint({
      diagnosticId: diag.id,
      failedStage: "vision_response",
      userCode: "ai_analyze_failed",
      errorCode: "openai_failed",
    });
    expect(hint).toContain(diag.id);
    expect(hint).toContain("vision_response");
  });

  it("prepareAssignment gate includes failedStage when attachment missing from store", async () => {
    process.env.ATLAS_MOCK_LLM = "true";
    process.env.ATLAS_ATTACHMENT_STORAGE = "local";
    delete process.env.VERCEL_ENV;

    const prepared = await prepareAssignmentWithVision({
      userId: "user_missing_img",
      assignment: "このレシートを家計簿Excelにしてください",
      metadata: {
        attachmentIds: ["img_does_not_exist"],
        jobId: "job_fail_stage",
      },
    });

    expect(prepared.skipped).toBe(false);
    expect(prepared.gate).toBeTruthy();
    expect(prepared.gate?.failedStage).toBe("storage_download");
    expect(prepared.gate?.failedStageLabel).toBe("保存画像の読み込み");
    expect(prepared.gate?.message).toContain("保存画像の読み込みで失敗");
    expect(prepared.gate?.diagnosticId).toMatch(/^vdiag_/);
    expect(prepared.gate?.developerCode).toBe("not_found");
    expect(prepared.metadata.visionDeveloperHint).toContain("診断ID");
  });

  it("VisionError carries diagnosticId and failedStage", () => {
    const err = new VisionError("timeout", "timed out", {
      diagnosticId: "vdiag_test",
      failedStage: "vision_response",
    });
    expect(err.diagnosticId).toBe("vdiag_test");
    expect(err.failedStage).toBe("vision_response");
    expect(err.code).toBe("timeout");
  });
});

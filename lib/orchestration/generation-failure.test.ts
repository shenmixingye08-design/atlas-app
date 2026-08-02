import { describe, expect, it } from "vitest";

import {
  createGenerationFailureDiagnostic,
  mapWordExportReasonToStage,
} from "./generation-failure";

describe("generation-failure mapping", () => {
  it("maps storage failures to STORAGE_UPLOAD", () => {
    const mapped = mapWordExportReasonToStage(
      "storage_failed:fault_inject:storage_upload",
    );
    expect(mapped.failedStage).toBe("STORAGE_UPLOAD");
    expect(mapped.errorCode).toBe("storage_failed");
    expect(mapped.lastSuccessStage).toBe("DOCX_VALIDATED");
  });

  it("maps empty content to WORD_CONTENT_GENERATED", () => {
    expect(
      mapWordExportReasonToStage("word_export_empty_content:source=empty")
        .failedStage,
    ).toBe("WORD_CONTENT_GENERATED");
  });

  it("creates durable diagnostic ids", () => {
    const d = createGenerationFailureDiagnostic({
      failedStage: "STORAGE_UPLOAD",
      errorCode: "storage_failed",
      userMessage: "保存に失敗",
      developerMessage: "storage_failed:x",
      requestId: "run_1",
      workJobId: "job_1",
      commanderRunId: "run_1",
      projectId: "commander-run_1",
      retryable: true,
    });
    expect(d.diagnosticId.startsWith("gfail_")).toBe(true);
    expect(d.timestamp).toBeTruthy();
  });
});

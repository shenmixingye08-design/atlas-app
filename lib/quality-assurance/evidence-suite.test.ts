import { describe, expect, it } from "vitest";

import { resetEvidenceStoreForTests } from "./evidence-store";
import { evaluateQualityGates } from "./gates";
import { runEvidenceSuite } from "./run-evidence-suite";
import { collectStaticCriticalFindings } from "./critical-gate";
import { measuredRate, unmeasuredRate } from "./rates";

describe("runEvidenceSuite (local)", () => {
  it("records success/failure/duration/request_id and never marks Release Ready without production", async () => {
    resetEvidenceStoreForTests();
    const summary = await runEvidenceSuite({ environment: "local" });

    expect(summary.totalCases).toBeGreaterThanOrEqual(15);
    expect(summary.cases.every((c) => c.requestId.length > 8)).toBe(true);
    expect(summary.cases.every((c) => typeof c.durationMs === "number")).toBe(
      true
    );
    expect(summary.cases.every((c) => Array.isArray(c.log))).toBe(true);
    expect(summary.reportPath).toBeTruthy();

    // Core generators should pass locally
    for (const id of [
      "word_generate",
      "excel_generate",
      "pdf_generate",
      "powerpoint_generate",
      "word_to_pdf",
      "image_to_pdf",
    ]) {
      const c = summary.cases.find((x) => x.id === id);
      expect(c, id).toBeTruthy();
      expect(c!.ok, `${id} ${c!.error}`).toBe(true);
    }

    // Vision/OCR/integration must not be vanity-passed
    expect(summary.cases.find((c) => c.id === "vision_analyze")?.ok).toBe(
      false
    );
    expect(summary.cases.find((c) => c.id === "ocr")?.ok).toBe(false);
    expect(summary.cases.find((c) => c.id === "integration")?.ok).toBe(false);

    const gates = evaluateQualityGates({
      rates: {
        wordSuccessRate: measuredRate(1, 0, "evidence"),
        excelSuccessRate: measuredRate(1, 0, "evidence"),
        pdfSuccessRate: measuredRate(1, 0, "evidence"),
        powerpointSuccessRate: measuredRate(1, 0, "evidence"),
        visionSuccessRate: unmeasuredRate("vision"),
        notificationSuccessRate: measuredRate(1, 0, "evidence"),
        storageSuccessRate: unmeasuredRate("storage"),
        jobSuccessRate: measuredRate(1, 0, "evidence"),
      },
      criticalFindings: collectStaticCriticalFindings({
        productionNotVerified: true,
      }),
      evidence: summary,
      productionE2eVerified: false,
    });
    expect(gates.releaseReady).toBe(false);
  }, 120_000);
});

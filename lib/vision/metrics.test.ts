import { beforeEach, describe, expect, it } from "vitest";

import {
  appendVisionCostRecord,
  resetVisionCostLedgerForTests,
} from "@/lib/vision/cost";
import {
  appendVisionDiagnosticStage,
  createVisionDiagnostic,
  resetVisionDiagnosticsForTests,
} from "@/lib/vision/diagnostics";
import { buildVisionAdminMetrics } from "@/lib/vision/metrics";

describe("buildVisionAdminMetrics", () => {
  beforeEach(() => {
    resetVisionCostLedgerForTests();
    resetVisionDiagnosticsForTests();
  });

  it("reports timeout count, average response, and success rate", async () => {
    await appendVisionCostRecord({
      userId: "u1",
      jobId: "j1",
      imageCount: 1,
      originalBytes: 1000,
      processedBytes: 800,
      detailLevel: "auto",
      model: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0.01,
      durationMs: 1000,
      success: true,
      cached: false,
      createdAt: new Date().toISOString(),
    });
    await appendVisionCostRecord({
      userId: "u1",
      jobId: "j2",
      imageCount: 1,
      originalBytes: 1000,
      processedBytes: 800,
      detailLevel: "auto",
      model: "gpt-4o",
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      durationMs: 2000,
      success: false,
      cached: false,
      createdAt: new Date().toISOString(),
    });

    const diag = createVisionDiagnostic({ userId: "u1", jobId: "j2" });
    appendVisionDiagnosticStage(diag.id, "vision_response", false, {
      errorCode: "timeout",
      userCode: "vision_temporary_error",
      timedOut: true,
      errorKind: "temporary",
      temporaryError: true,
    });

    const metrics = buildVisionAdminMetrics({
      sinceMs: Date.now() - 60_000,
    });
    expect(metrics.totalAttempts).toBe(2);
    expect(metrics.successCount).toBe(1);
    expect(metrics.successRate).toBeCloseTo(0.5);
    expect(metrics.averageResponseMs).toBeCloseTo(1500);
    expect(metrics.timeoutCount).toBeGreaterThanOrEqual(1);
    expect(metrics.temporaryErrorCount).toBeGreaterThanOrEqual(1);
  });
});

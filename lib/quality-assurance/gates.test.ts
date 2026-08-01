import { describe, expect, it } from "vitest";

import { evaluateQualityGates, QUALITY_GATE_THRESHOLDS } from "./gates";
import { measuredRate, unmeasuredRate } from "./rates";
import type { CriticalFinding, EvidenceSuiteSummary } from "./types";

function allPassingRates() {
  return {
    wordSuccessRate: measuredRate(99, 1, "t"),
    excelSuccessRate: measuredRate(99, 1, "t"),
    pdfSuccessRate: measuredRate(99, 1, "t"),
    powerpointSuccessRate: measuredRate(99, 1, "t"),
    visionSuccessRate: measuredRate(96, 4, "t"),
    notificationSuccessRate: measuredRate(99, 1, "t"),
    storageSuccessRate: measuredRate(999, 1, "t"),
    jobSuccessRate: measuredRate(99, 1, "t"),
  };
}

function passingEvidence(): EvidenceSuiteSummary {
  return {
    suiteId: "test",
    totalCases: 2,
    passed: 2,
    failed: 0,
    environment: "production",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    cases: [],
  };
}

describe("evaluateQualityGates", () => {
  it("fails when rates are unmeasured (no vanity 100%)", () => {
    const result = evaluateQualityGates({
      rates: {
        wordSuccessRate: unmeasuredRate("x"),
        excelSuccessRate: unmeasuredRate("x"),
        pdfSuccessRate: unmeasuredRate("x"),
        powerpointSuccessRate: unmeasuredRate("x"),
        visionSuccessRate: unmeasuredRate("x"),
        notificationSuccessRate: unmeasuredRate("x"),
        storageSuccessRate: unmeasuredRate("x"),
        jobSuccessRate: unmeasuredRate("x"),
      },
      criticalFindings: [],
      evidence: null,
      productionE2eVerified: false,
    });
    expect(result.releaseReady).toBe(false);
    expect(result.thresholdsMet).toBe(false);
    expect(result.checks.every((c) => !c.pass)).toBe(true);
  });

  it("fails below Word 99% even if others pass", () => {
    const rates = allPassingRates();
    rates.wordSuccessRate = measuredRate(98, 2, "t");
    const result = evaluateQualityGates({
      rates,
      criticalFindings: [],
      evidence: passingEvidence(),
      productionE2eVerified: true,
    });
    expect(result.releaseReady).toBe(false);
    expect(result.checks.find((c) => c.id === "word_success")?.pass).toBe(
      false
    );
  });

  it("fails on any blocking Critical", () => {
    const critical: CriticalFinding[] = [
      {
        id: "x",
        category: "data_loss",
        severity: "Critical",
        title: "data loss",
        detail: "1",
        evidenceRefs: [],
        blocksRelease: true,
        detectedAt: new Date().toISOString(),
      },
    ];
    const result = evaluateQualityGates({
      rates: allPassingRates(),
      criticalFindings: critical,
      evidence: passingEvidence(),
      productionE2eVerified: true,
    });
    expect(result.releaseReady).toBe(false);
    expect(result.hasCriticalFindings).toBe(true);
  });

  it("requires production E2E verification", () => {
    const result = evaluateQualityGates({
      rates: allPassingRates(),
      criticalFindings: [],
      evidence: passingEvidence(),
      productionE2eVerified: false,
    });
    expect(result.releaseReady).toBe(false);
    expect(result.productionE2eVerified).toBe(false);
  });

  it("passes only when thresholds + evidence + production + no critical", () => {
    const result = evaluateQualityGates({
      rates: allPassingRates(),
      criticalFindings: [],
      evidence: passingEvidence(),
      productionE2eVerified: true,
    });
    expect(QUALITY_GATE_THRESHOLDS.storageSuccessRate).toBe(0.999);
    expect(result.releaseReady).toBe(true);
  });
});

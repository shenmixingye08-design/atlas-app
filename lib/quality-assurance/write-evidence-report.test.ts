import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { buildQualityDashboardSnapshot } from "./aggregator";
import { resetEvidenceStoreForTests } from "./evidence-store";
import { runEvidenceSuite } from "./run-evidence-suite";
import { formatRatePct } from "./rates";

const OUT =
  process.env.QUALITY_EVIDENCE_DIR ??
  "/opt/cursor/artifacts/quality-assurance";

describe("evidence final report writer", () => {
  it.skipIf(process.env.WRITE_QUALITY_EVIDENCE !== "1")(
    "writes measured evidence report (not self-scores)",
    async () => {
    resetEvidenceStoreForTests();
    const summary = await runEvidenceSuite({ environment: "local" });
    const snapshot = await buildQualityDashboardSnapshot({
      evidence: summary,
      windowDays: 7,
      productionE2eVerified: false,
    });

    mkdirSync(OUT, { recursive: true });
    const reportPath = join(OUT, "EVIDENCE_FINAL_REPORT.md");
    const lines = [
      "# MINERVOT Evidence Quality Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      "## Release Ready",
      "",
      `**${snapshot.releaseReady ? "YES" : "NO"}**`,
      "",
      "### Reasons",
      "",
      ...snapshot.gates.reasons.map((r) => `- ${r}`),
      "",
      "## Measured rates (not self-scores)",
      "",
      "| Metric | Rate | Source |",
      "| --- | --- | --- |",
      `| Intent | ${formatRatePct(snapshot.ai.intentSuccess)} | ${snapshot.ai.intentSuccess.source} |`,
      `| Format | ${formatRatePct(snapshot.ai.formatSuccess)} | ${snapshot.ai.formatSuccess.source} |`,
      `| Word | ${formatRatePct(snapshot.deliverables.word)} | ${snapshot.deliverables.word.source} |`,
      `| Excel | ${formatRatePct(snapshot.deliverables.excel)} | ${snapshot.deliverables.excel.source} |`,
      `| PDF | ${formatRatePct(snapshot.deliverables.pdf)} | ${snapshot.deliverables.pdf.source} |`,
      `| PowerPoint | ${formatRatePct(snapshot.deliverables.powerpoint)} | ${snapshot.deliverables.powerpoint.source} |`,
      `| Vision | ${formatRatePct(snapshot.ai.visionSuccess)} | ${snapshot.ai.visionSuccess.source} |`,
      `| OCR | ${formatRatePct(snapshot.ai.ocrSuccess)} | ${snapshot.ai.ocrSuccess.source} |`,
      `| Notification | ${formatRatePct(snapshot.notifications.successRate)} | ${snapshot.notifications.successRate.source} |`,
      `| Storage download | ${formatRatePct(snapshot.storage.downloadSuccess)} | ${snapshot.storage.downloadSuccess.source} |`,
      `| Job completed | ${formatRatePct(snapshot.jobs.completedRate)} | ${snapshot.jobs.completedRate.source} |`,
      "",
      `Avg generate: ${snapshot.deliverables.avgGenerateMs.avgMs ?? "未計測"} ms / p95 ${snapshot.deliverables.avgGenerateMs.p95Ms ?? "未計測"} ms`,
      `Avg confidence: ${snapshot.ai.avgConfidence != null ? snapshot.ai.avgConfidence.toFixed(4) : "未計測"}`,
      "",
      "## Before / After",
      "",
      "- Before (self-score reference only): AI 88 / UX 82 / Deliverable 80",
      "- After: measured rates above (unmeasured = gate fail)",
      "",
      "## Evidence suite",
      "",
      `- suiteId: ${summary.suiteId}`,
      `- environment: ${summary.environment}`,
      `- passed: ${summary.passed}/${summary.totalCases}`,
      `- failed: ${summary.failed}`,
      `- reportPath: ${summary.reportPath}`,
      "",
      "| Case | OK | ms | request_id | error |",
      "| --- | --- | --- | --- | --- |",
      ...summary.cases.map(
        (c) =>
          `| ${c.id} | ${c.ok ? "YES" : "NO"} | ${c.durationMs} | \`${c.requestId}\` | ${c.error ?? ""} |`
      ),
      "",
      "## Critical findings",
      "",
      ...snapshot.criticalFindings.map(
        (c) => `- **${c.id}** [${c.category}] ${c.title} — ${c.detail}`
      ),
      "",
      "## Screenshots",
      "",
      "Not captured: PRODUCTION_E2E_BASE_URL unset. screenshotPath=null for all cases (honest).",
      "",
      "## Gate thresholds",
      "",
      "- Word/Excel/PDF/PowerPoint ≥ 99%",
      "- Vision ≥ 95%",
      "- Notification ≥ 99%",
      "- Storage ≥ 99.9%",
      "- Job ≥ 99%",
      "",
    ];
    writeFileSync(reportPath, lines.join("\n"), "utf8");
    writeFileSync(
      join(OUT, "EVIDENCE_FINAL_REPORT.json"),
      JSON.stringify({ summary, snapshot }, null, 2),
      "utf8"
    );

    expect(snapshot.releaseReady).toBe(false);
    expect(summary.totalCases).toBeGreaterThanOrEqual(15);
    expect(reportPath).toContain("EVIDENCE_FINAL_REPORT.md");
  },
    120_000
  );
});

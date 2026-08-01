import { describe, expect, it } from "vitest";

import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { normalizeJapaneseBusinessText } from "@/lib/deliverables/pptx-production/japanese-normalize";
import { inspectPptxProduction } from "@/lib/deliverables/pptx-production/pptx-inspect";
import { runPptxProductionSuite } from "@/lib/deliverables/pptx-production/run-suite";

describe("pptx production quality", () => {
  it("normalizes Japanese business text", () => {
    expect(normalizeJapaneseBusinessText("ＡＰＩ　ｖ１")).toContain("API");
    expect(normalizeJapaneseBusinessText("確認 、 完了 。")).toBe("確認、完了。");
  });

  it("emits production OpenXML with theme, master, tables, charts, notes", async () => {
    const file = await new PptxDeliverableGenerator().generate(
      [
        "# 品質検査デッキ",
        "",
        "## 概要",
        "",
        "本文です。",
        "",
        "- 要点1",
        "- 要点2",
        "",
        "| 項目 | 金額 |",
        "| --- | --- |",
        "| A | 1200 |",
        "| B | 800 |",
        "| C | 600 |",
      ].join("\n"),
      "品質検査デッキ",
    );
    const report = inspectPptxProduction(file.buffer);
    expect(report.ok).toBe(true);
    expect(report.hasPresentation).toBe(true);
    expect(report.hasTheme).toBe(true);
    expect(report.hasSlideMaster).toBe(true);
    expect(report.hasSlideLayout).toBe(true);
    expect(report.slideCount).toBeGreaterThanOrEqual(4);
    expect(report.chartCount).toBeGreaterThanOrEqual(1);
    expect(report.tableHintCount).toBeGreaterThanOrEqual(1);
    expect(report.notesCount).toBeGreaterThanOrEqual(1);
    expect(report.brokenRelationships).toBe(0);
  });

  it("supports 4:3 layout without corruption", async () => {
    const file = await new PptxDeliverableGenerator().generate(
      "# 4対3\n\n## 節\n\n本文",
      "layout43",
      { aspectRatio: "4:3" },
    );
    expect(inspectPptxProduction(file.buffer).ok).toBe(true);
  });

  it("runs 100-case durability suite with parity and revision", async () => {
    const report = await runPptxProductionSuite();
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        suiteId: report.suiteId,
        reportPath: report.reportPath,
        generatedAt: report.generatedAt,
        featureEvaluation: report.featureEvaluation,
        n: report.n,
        success: report.success,
        corrupt: report.corrupt,
        successRate: report.successRate,
        corruptRate: report.corruptRate,
        avgMs: report.avgMs,
        p95Ms: report.p95Ms,
        revisionOk: report.revisionOk,
        wordParityOk: report.wordParityOk,
        excelParityOk: report.excelParityOk,
        pdfParityOk: report.pdfParityOk,
        phasePass: report.phasePass,
      }),
    );
    expect(report.n).toBeGreaterThanOrEqual(100);
    expect(report.successRate).toBe(1);
    expect(report.corruptRate).toBe(0);
    expect(report.revisionOk).toBe(true);
    expect(report.wordParityOk).toBe(true);
    expect(report.excelParityOk).toBe(true);
    expect(report.pdfParityOk).toBe(true);
    expect(report.phasePass).toBe(true);
  }, 300_000);
});

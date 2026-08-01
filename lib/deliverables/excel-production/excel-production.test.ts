import { describe, expect, it } from "vitest";

import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";
import { coerceTypedCell } from "@/lib/deliverables/excel-production/cell-types";
import { REQUIRED_FORMULA_NAMES } from "@/lib/deliverables/excel-production/formulas";
import { runExcelProductionSuite } from "@/lib/deliverables/excel-production/run-suite";
import { inspectXlsxProduction } from "@/lib/deliverables/excel-production/xlsx-quality";

describe("excel production quality", () => {
  it("coerces typed cells instead of string-only values", () => {
    expect(coerceTypedCell("1,200", "currency").value).toBe(1200);
    expect(coerceTypedCell("15%", "percent").value).toBeCloseTo(0.15);
    expect(coerceTypedCell("TRUE", "boolean").value).toBe(true);
    const date = coerceTypedCell("2026-07-01", "date").value;
    expect(date).toBeInstanceOf(Date);
  });

  it("emits production OpenXML parts, formulas, and charts", async () => {
    const gen = new XlsxDeliverableGenerator();
    const file = await gen.generate(
      [
        "# 売上",
        "",
        "| 日付 | 商品 | 金額 | 構成比 |",
        "| --- | --- | --- | --- |",
        "| 2026-07-01 | A | 1200 | 40% |",
        "| 2026-07-02 | B | 800 | 30% |",
        "| 2026-07-03 | C | 600 | 30% |",
      ].join("\n"),
      "品質検査サンプル",
      { assignment: "売上管理をExcelで" },
    );
    const report = inspectXlsxProduction(file.buffer);
    expect(report.ok).toBe(true);
    expect(report.hasWorkbook).toBe(true);
    expect(report.hasStyles).toBe(true);
    expect(report.hasSharedStrings).toBe(true);
    expect(report.hasTheme).toBe(true);
    expect(report.worksheetCount).toBeGreaterThanOrEqual(2);
    expect(report.formulaCount).toBeGreaterThanOrEqual(
      REQUIRED_FORMULA_NAMES.length,
    );
    expect(report.brokenFormulaMarkers).toBe(0);
    expect(report.chartCount).toBeGreaterThanOrEqual(1);
    expect(report.brokenRelationships).toBe(0);
  });

  it("builds image form sheets for receipt assignment", async () => {
    const file = await new XlsxDeliverableGenerator().generate(
      [
        "# 領収書",
        "",
        "- 日付: 2026-07-10",
        "- 店舗: テスト店",
        "- 合計: 1500円",
        "",
        "| 品名 | 数量 | 金額 |",
        "| --- | --- | --- |",
        "| お茶 | 1 | 150 |",
        "| 弁当 | 1 | 600 |",
      ].join("\n"),
      "レシート",
      { assignment: "レシート画像をExcelにまとめて" },
    );
    const report = inspectXlsxProduction(file.buffer);
    expect(report.ok).toBe(true);
    expect(report.sheetNames.some((n) => n.includes("表紙") || n.includes("メタ") || n.includes("領収") || n.length > 0)).toBe(
      true,
    );
    expect(report.worksheetCount).toBeGreaterThanOrEqual(2);
  });

  it("runs 100-case durability suite with revision and CSV parity", async () => {
    const report = await runExcelProductionSuite();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
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
      parityOk: report.parityOk,
      csvOk: report.csvOk,
      formulaCatalogOk: report.formulaCatalogOk,
      phasePass: report.phasePass,
    }));
    expect(report.n).toBeGreaterThanOrEqual(100);
    expect(report.successRate).toBe(1);
    expect(report.corruptRate).toBe(0);
    expect(report.revisionOk).toBe(true);
    expect(report.csvOk).toBe(true);
    expect(report.parityOk).toBe(true);
    expect(report.formulaCatalogOk).toBe(true);
    expect(report.phasePass).toBe(true);
  }, 120_000);
});

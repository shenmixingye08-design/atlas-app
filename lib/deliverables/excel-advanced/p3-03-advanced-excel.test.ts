import { describe, expect, it } from "vitest";

import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";

import { inspectXlsxAdvancedParts } from "./chart-ooxml";
import { buildPivotAggregate, PIVOT_SHEET_NAME } from "./pivot";

const TABLE = `# 売上

| カテゴリ | 金額 |
| --- | ---: |
| 食品 | 1000 |
| 飲料 | 500 |
| 食品 | 250 |
`;

describe("P3-03 advanced Excel pivot + chart", () => {
  it("aggregates SUM by category deterministically", () => {
    const plan = buildPivotAggregate(
      ["カテゴリ", "金額"],
      [
        ["食品", 1000],
        ["飲料", 500],
        ["食品", 250],
      ],
    );
    expect(plan).not.toBeNull();
    expect(plan!.rows).toHaveLength(2);
    expect(plan!.rows).toEqual(
      expect.arrayContaining([
        { category: "飲料", total: 500 },
        { category: "食品", total: 1250 },
      ]),
    );
  });

  it("embeds pivot sheet + chart/drawing OOXML parts", async () => {
    const file = await new XlsxDeliverableGenerator().generate(TABLE, "売上", {
      excel: { includeChart: true, includePivot: true },
    });
    expect(file.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
    const parts = await inspectXlsxAdvancedParts(file.buffer);
    expect(parts.hasPivotSheet).toBe(true);
    expect(parts.hasChart).toBe(true);
    expect(parts.hasDrawing).toBe(true);
    expect(parts.chartPaths.some((p) => p.includes("chart1.xml"))).toBe(true);
  });

  it("auto-enables advanced parts for aggregatable tables", async () => {
    const file = await new XlsxDeliverableGenerator().generate(TABLE, "auto");
    const parts = await inspectXlsxAdvancedParts(file.buffer);
    expect(parts.hasPivotSheet).toBe(true);
    expect(parts.hasChart).toBe(true);
  });

  it("honors explicit opt-out", async () => {
    const file = await new XlsxDeliverableGenerator().generate(TABLE, "off", {
      excel: { includeChart: false, includePivot: false },
    });
    const parts = await inspectXlsxAdvancedParts(file.buffer);
    expect(parts.hasPivotSheet).toBe(false);
    expect(parts.hasChart).toBe(false);
    expect(parts.hasDrawing).toBe(false);
  });

  it("fail-closes when chart forced without aggregatable columns", async () => {
    await expect(
      new XlsxDeliverableGenerator().generate("# 見出し\n\n本文だけ", "fail", {
        excel: { includeChart: true, includePivot: true },
      }),
    ).rejects.toThrow(/excel_advanced_no_aggregatable_columns/);
  });

  it("is retry-safe (same advanced parts on regenerate)", async () => {
    const gen = new XlsxDeliverableGenerator();
    const a = await gen.generate(TABLE, "idem");
    const b = await gen.generate(TABLE, "idem");
    const pa = await inspectXlsxAdvancedParts(a.buffer);
    const pb = await inspectXlsxAdvancedParts(b.buffer);
    expect(pa).toEqual(pb);
    expect(pa.hasPivotSheet).toBe(true);
    void PIVOT_SHEET_NAME;
  });
});

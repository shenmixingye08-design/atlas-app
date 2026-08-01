import { describe, expect, it } from "vitest";

import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { inspectDocxProduction } from "@/lib/deliverables/word-production/docx-quality";
import { normalizeJapaneseBusinessText } from "@/lib/deliverables/word-production/japanese-normalize";
import { runWordProductionSuite } from "@/lib/deliverables/word-production/run-suite";
import { parseDeliverableContent } from "@/lib/deliverables/parse-content";

describe("word production quality", () => {
  it("normalizes Japanese business text without inventing content", () => {
    expect(normalizeJapaneseBusinessText("ＡＰＩ ｖ１．２　テスト")).toContain(
      "API",
    );
    expect(normalizeJapaneseBusinessText("確認 、 完了 。")).toBe("確認、完了。");
  });

  it("does not turn markdown table separators into paragraphs", () => {
    const parsed = parseDeliverableContent(
      ["# t", "", "| A | B |", "| --- | --- |", "| 1 | 2 |", "", "本文"].join(
        "\n",
      ),
    );
    const blocks = parsed.sections.flatMap((s) => s.blocks);
    const tables = blocks.filter((b) => b.type === "table");
    expect(tables).toHaveLength(1);
    expect(
      blocks.some((b) => b.type === "paragraph" && b.text.includes("---")),
    ).toBe(false);
  });

  it("emits production OpenXML parts and numbering", async () => {
    const gen = new DocxDeliverableGenerator();
    const file = await gen.generate(
      [
        "# 品質検査サンプル",
        "",
        "## 見出し2",
        "",
        "本文です。",
        "",
        "1. 番号付き1",
        "2. 番号付き2",
        "",
        "- 箇条1",
        "",
        "| 列A | 列B |",
        "| --- | --- |",
        "| 100円 | 2026-08-01 |",
      ].join("\n"),
      "quality-sample",
      { title: "品質検査サンプル", templateId: "business-report" },
    );
    const report = inspectDocxProduction(file.buffer);
    expect(report.ok).toBe(true);
    expect(report.hasStyles).toBe(true);
    expect(report.hasNumbering).toBe(true);
    expect(report.hasSettings).toBe(true);
    expect(report.hasDocumentRels).toBe(true);
    expect(report.brokenRelationships).toBe(0);
    expect(report.zeroByte).toBe(false);
    expect(report.tableCount).toBeGreaterThanOrEqual(1);
  });

  it(
    "runs 100-case durability suite with long pages and revision",
    async () => {
      const suite = await runWordProductionSuite({
        caseCount: 100,
        includeLongPages: true,
      });
      expect(suite.latest.n).toBe(100);
      expect(suite.latest.successRate).toBeGreaterThanOrEqual(0.95);
      expect(suite.latest.corruptRate).toBe(0);
      expect(suite.latest.revisionOk).toBe(true);
      console.log(
        JSON.stringify({
          suiteId: suite.suiteId,
          reportPath: suite.reportPath,
          ...suite.latest,
        }),
      );
    },
    600_000,
  );
});

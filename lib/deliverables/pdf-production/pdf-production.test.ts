import { describe, expect, it } from "vitest";

import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { normalizeJapaneseBusinessText } from "@/lib/deliverables/pdf-production/japanese-normalize";
import { inspectPdfProduction } from "@/lib/deliverables/pdf-production/pdf-inspect";
import { runPdfProductionSuite } from "@/lib/deliverables/pdf-production/run-suite";
import { parseDeliverableContent } from "@/lib/deliverables/parse-content";

describe("pdf production quality", () => {
  it("normalizes Japanese business text without inventing content", () => {
    expect(normalizeJapaneseBusinessText("ＡＰＩ　ｖ１")).toContain("API");
    expect(normalizeJapaneseBusinessText("確認 、 完了 。")).toBe("確認、完了。");
  });

  it("parses data-url images for PDF embedding", () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const parsed = parseDeliverableContent(`# t\n\n![cap](${png})\n`);
    const images = parsed.sections.flatMap((s) =>
      s.blocks.filter((b) => b.type === "imagePlaceholder"),
    );
    expect(images[0]?.type).toBe("imagePlaceholder");
    if (images[0]?.type === "imagePlaceholder") {
      expect(images[0].dataUrl?.startsWith("data:image/png")).toBe(true);
    }
  });

  it("emits production PDF with fonts, metadata, tables, and images", async () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";
    const file = await new PdfDeliverableGenerator().generate(
      [
        "# 品質検査サンプル",
        "",
        "## 見出し",
        "",
        "本文です。句読点、禁則を確認します。",
        "",
        "| 項目 | 金額 |",
        "| --- | --- |",
        "| A | 1200 |",
        "| B | 800 |",
        "",
        `![図1](${png})`,
      ].join("\n"),
      "品質検査サンプル",
    );
    const report = await inspectPdfProduction(file.buffer);
    expect(report.ok).toBe(true);
    expect(report.headerOk).toBe(true);
    expect(report.eofOk).toBe(true);
    expect(report.xrefOk).toBe(true);
    expect(report.catalogOk).toBe(true);
    expect(report.metadataOk).toBe(true);
    expect(report.fontEmbedded).toBe(true);
    expect(report.pageCount).toBeGreaterThanOrEqual(1);
    expect(report.imageXObjectCount).toBeGreaterThanOrEqual(1);
  });

  it("runs 100-case durability suite with parity and revision", async () => {
    const report = await runPdfProductionSuite();
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
        phasePass: report.phasePass,
      }),
    );
    expect(report.n).toBeGreaterThanOrEqual(100);
    expect(report.successRate).toBe(1);
    expect(report.corruptRate).toBe(0);
    expect(report.revisionOk).toBe(true);
    expect(report.wordParityOk).toBe(true);
    expect(report.excelParityOk).toBe(true);
    expect(report.phasePass).toBe(true);
  }, 300_000);
});

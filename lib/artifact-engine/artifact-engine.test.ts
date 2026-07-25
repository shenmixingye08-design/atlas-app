import { describe, expect, it } from "vitest";

import { analyzeArtifact } from "./analyze";
import { buildArtifactPreview } from "./build-preview";
import { detectArtifactType } from "./detect-artifact-type";
import { recommendArtifactFormats } from "./recommend-formats";
import { artifactTypeToLearningDomain } from "./learning-bridge";

describe("detectArtifactType", () => {
  it("detects ranking requests for Excel-oriented artifacts", () => {
    const result = detectArtifactType({
      assignment: "人気商品のランキング表を作ってください",
    });
    expect(result.artifactType).toBe("ranking");
  });

  it("detects contract documents", () => {
    const result = detectArtifactType({
      assignment: "業務委託契約書のドラフトを作成",
    });
    expect(result.artifactType).toBe("contract");
  });

  it("detects invoice documents", () => {
    const result = detectArtifactType({
      assignment: "先月分の請求書を作成してください",
    });
    expect(result.artifactType).toBe("invoice");
  });
});

describe("recommendArtifactFormats", () => {
  it("recommends Excel for ranking artifacts", () => {
    const plan = recommendArtifactFormats({
      artifactType: "ranking",
      assignment: "ランキングを作って",
      content: "| 順位 | 商品 |\n| --- | --- |\n| 1 | A |",
    });
    expect(plan.formats).toContain("xlsx");
    expect(plan.formats).toContain("docx");
  });

  it("recommends pptx for sales materials", () => {
    const plan = recommendArtifactFormats({
      artifactType: "sales_material",
      assignment: "営業資料を作成",
      content: "## 概要\n提案です",
    });
    expect(plan.formats[0]).toBe("pptx");
  });

  it("recommends xlsx+pdf for invoices", () => {
    const plan = recommendArtifactFormats({
      artifactType: "invoice",
      assignment: "請求書",
      content: "明細",
    });
    expect(plan.formats).toContain("xlsx");
    expect(plan.formats).toContain("pdf");
  });
});

describe("buildArtifactPreview", () => {
  it("renders structure without markdown markers", () => {
    const preview = buildArtifactPreview({
      assignment: "提案書を作成",
      title: "導入ご提案",
      content: `# 導入ご提案

## 概要
手作業を削減します。

## 提案内容
- 自動整形
- 目次付与

| 項目 | 内容 |
| --- | --- |
| 期間 | 2週 |
`,
    });

    expect(preview.title).toBe("導入ご提案");
    expect(preview.sections.length).toBeGreaterThan(0);
    const plainText = [
      preview.title,
      ...preview.sections.flatMap((section) => [
        section.title,
        ...section.blocks.flatMap((block) => {
          if (block.type === "paragraph" || block.type === "callout") {
            return [block.text];
          }
          if (
            block.type === "bulletList" ||
            block.type === "numberedList" ||
            block.type === "keyCard"
          ) {
            return block.items;
          }
          return [];
        }),
      ]),
    ].join("\n");
    expect(plainText).not.toMatch(/^#{1,3}\s/m);
    expect(plainText).not.toMatch(/^\s*---+\s*$/m);
    expect(
      preview.sections.some((section) =>
        section.blocks.some(
          (block) =>
            block.type === "table" &&
            block.headers.includes("項目") &&
            block.rows.some((row) => row.includes("2週")),
        ),
      ),
    ).toBe(true);
  });
});

describe("analyzeArtifact", () => {
  it("returns suggestions for Excel when tables exist but xlsx was not generated", () => {
    const result = analyzeArtifact({
      assignment: "比較表をまとめて",
      content: "| A | B |\n| --- | --- |\n| 1 | 2 |",
      generatedFormats: ["docx", "pdf"],
      hasWorkProfile: false,
    });

    expect(result.detection.excelRecommended).toBe(true);
    expect(result.suggestions.some((item) => item.kind === "excel")).toBe(true);
    expect(
      result.suggestions.some((item) => item.kind === "company_profile"),
    ).toBe(true);
  });
});

describe("learning bridge", () => {
  it("maps sales artifacts to sales_material domain", () => {
    expect(artifactTypeToLearningDomain("sales_material")).toBe(
      "sales_material",
    );
    expect(artifactTypeToLearningDomain("invoice")).toBe("bookkeeping");
  });
});

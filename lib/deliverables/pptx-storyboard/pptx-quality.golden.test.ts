import { describe, expect, it } from "vitest";

import { getDeliverableGenerator } from "@/lib/deliverables/generators";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { resolveGenerationFormats } from "@/lib/deliverables/resolve-formats";
import { verifyGeneratedExportAsync } from "@/lib/deliverables/export-verify";
import { P108_PROBE_PNG_DATA_URL } from "@/lib/deliverables/embedded-image";
import { inspectPptxDesignParts } from "@/lib/deliverables/pptx-templates";

import {
  estimatePresentationPipelineCost,
  evaluatePptPlanSafety,
} from "./cost-estimate";
import { resolvePresentationIntent } from "./intent";
import { sanitizeSlideTitle } from "./copy";
import { buildSlideStoryboard } from "./storyboard";
import { parseDeliverableContent } from "../parse-content";
import { verifyPptxDeck } from "./verify";

const gen = new PptxDeliverableGenerator();

const SALES = `# 太陽光発電の営業提案

## 課題
電気代が年々上昇し、工場の固定費を圧迫しています。売上は前年比18%増加でも利益率が下がっています。

## 現状
- 電気代が年間 420万円
- 昼間の稼働が中心
- 再エネ比率は 8%

## 解決策
1. 屋根に太陽光を設置
2. 余剰を売電せず自家消費
3. 3ヶ月で導入

## メリット
- 年間削減 420時間相当の管理工数
- 導入費 ¥980/月のリース
- CO2を削減

## 比較
- 現行：電気代が変動し続ける
- 提案：20年の単価を固定

| 項目 | 現行 | 提案 |
| --- | --- | --- |
| 年額 | 4200000 | 2800000 |
| 初期 | 0 | 980 |

## 次のアクション
- 現地調査の日程を決める
`;

const COMPANY = `# 会社紹介

## 概要
MINERVOTは、お客様の習慣的な作業を減らすAI秘書です。

## 事業
- 文書作成
- 表計算
- 自動化

## 実績
導入費 ¥980/月 で中小企業 120社が利用しています。
`;

const EXEC = `# 経営報告

## 結論
売上は前年比18%増加し、営業利益は計画どおりです。

## KPI
| 指標 | 値 |
| --- | ---: |
| 売上 | 120 |
| 利益 | 18 |
| 件数 | 40 |

## 課題
採用が追いついていません。

## 次のアクション
採用計画を来月までに確定します。
`;

const COMPARE = `# 商品比較

## 比較
- A案は初期費用が低い
- B案は運用費が低い
- A案はサポートが平日のみ
- B案は24時間

| 項目 | A案 | B案 |
| --- | --- | --- |
| 月額 | 980 | 2980 |
| サポート | 平日 | 24時間 |
`;

const DATA = `# データ報告

## 推移
| 月 | 売上 |
| --- | ---: |
| 1月 | 100 |
| 2月 | 120 |
| 3月 | 150 |
| 4月 | 140 |

## 内訳
| 部門 | 構成 |
| --- | ---: |
| 営業 | 45% |
| 開発 | 35% |
| 管理 | 20% |
`;

const PROSE = `# ブログを説明資料に

本文の要点は、習慣的な作業を秘書が肩代わりすることです。毎回同じ入力をしない。判断はMINERVOTが行う。最後に次のアクションを提示します。
`;

describe("pptx intent + copy", () => {
  it("classifies sales vs report vs company", () => {
    expect(
      resolvePresentationIntent({ assignment: "太陽光発電の営業資料を10枚で" }),
    ).toBe("sales_proposal");
    expect(resolvePresentationIntent({ assignment: "経営会議の報告" })).toBe(
      "exec_report",
    );
    expect(resolvePresentationIntent({ assignment: "会社紹介資料を作って" })).toBe(
      "company",
    );
  });

  it("strips English chrome titles", () => {
    expect(sanitizeSlideTitle("背景 — Key points")).toBe("背景");
    expect(sanitizeSlideTitle("Key points")).not.toMatch(/Key points/i);
  });

  it("parses a markdown table as one block with data rows", () => {
    const parsed = parseDeliverableContent(`# 会議

## 数字

| Code | Qty |
| --- | --- |
| ALPHA | 2 |
| BETA | 4 |
`);
    const tables = parsed.sections
      .flatMap((section) => section.blocks)
      .filter((block) => block.type === "table");
    expect(tables).toHaveLength(1);
    const table = tables[0];
    expect(table?.type).toBe("table");
    if (table?.type === "table") {
      expect(table.headers).toEqual(["Code", "Qty"]);
      expect(table.rows).toEqual([
        ["ALPHA", "2"],
        ["BETA", "4"],
      ]);
    }
    const board = buildSlideStoryboard({
      parsed,
      assignment: "会議資料",
      showAgenda: false,
      showSectionDividers: false,
      showClosing: false,
      slideCountHint: null,
    });
    expect(
      board.slides.some(
        (slide) => slide.layout === "table" && slide.table?.rows.length === 2,
      ),
    ).toBe(true);
  });
});

describe("PowerPoint golden fixtures", () => {
  it("title / section / CTA / Japanese / no Key points", async () => {
    const file = await gen.generate(SALES, "営業提案", {
      assignment: "太陽光発電の営業資料を10枚で作って",
      powerpoint: { templateId: "proposal" },
    });
    const verify = await verifyPptxDeck(file.buffer);
    expect(verify.ok).toBe(true);
    expect(verify.slideCount).toBeGreaterThanOrEqual(6);
    expect(verify.titles.join("\n")).not.toMatch(/Key points|Overview|Thank you/i);
    expect(verify.titles[0]).toMatch(/太陽光|営業/);
    expect(verify.fontFaces.some((f) => /Yu Gothic|Gothic|Noto/i.test(f))).toBe(
      true,
    );
  });

  it("accepts 1-char Japanese section titles such as 表", async () => {
    const md = `# P06運用検証レポート

## 概要
MINERVOTは依頼から成果物まで一気通貫で完了します。

## 本文
習慣的な作業を減らし、途中停止なく成果物を届けます。

## 表
| 形式 | 拡張子 |
| --- | --- |
| Word | .docx |
| Excel | .xlsx |
| PDF | .pdf |
| PowerPoint | .pptx |
`;
    const file = await gen.generate(md, "p06表", {
      assignment: "P06運用検証 全形式成果物",
      powerpoint: { templateId: "business" },
    });
    const verify = await verifyPptxDeck(file.buffer);
    expect(verify.reasons).not.toContain("empty_slide");
    expect(verify.ok).toBe(true);
    expect(verify.titles.some((title) => title.includes("表"))).toBe(true);
  });

  it("company intro stays compact and Japanese", async () => {
    const file = await gen.generate(COMPANY, "会社紹介", {
      assignment: "会社紹介資料を8枚で",
      powerpoint: { slideCountHint: 8, templateId: "simple" },
    });
    const verify = await verifyPptxDeck(file.buffer);
    expect(verify.ok).toBe(true);
    expect(verify.slideCount).toBeLessThanOrEqual(10);
  });

  it("exec report is conclusion-first with KPI/table", async () => {
    const file = await gen.generate(EXEC, "経営報告", {
      assignment: "経営報告をPowerPointで",
      powerpoint: { templateId: "report" },
    });
    const verify = await verifyPptxDeck(file.buffer);
    expect(verify.ok).toBe(true);
    expect(verify.tableCount).toBeGreaterThan(0);
    expect(verify.titles.some((t) => /結論|売上/.test(t))).toBe(true);
  });

  it("comparison layout + table", async () => {
    const file = await gen.generate(COMPARE, "比較", {
      assignment: "商品比較資料を6枚で",
      powerpoint: { slideCountHint: 8 },
    });
    const verify = await verifyPptxDeck(file.buffer);
    expect(verify.ok).toBe(true);
    expect(verify.tableCount).toBeGreaterThan(0);
  });

  it("data report includes native chart from source numbers", async () => {
    const file = await gen.generate(DATA, "データ", {
      assignment: "データ報告をPowerPointで",
    });
    const verify = await verifyPptxDeck(file.buffer);
    expect(verify.ok).toBe(true);
    expect(verify.chartCount).toBeGreaterThan(0);
    expect(verify.tableCount).toBeGreaterThan(0);
  });

  it("prose becomes short bullets, not a wall of text", async () => {
    const parsed = parseDeliverableContent(PROSE);
    const board = buildSlideStoryboard({
      parsed,
      assignment: "この文章をプレゼン資料にして",
      showAgenda: false,
      showSectionDividers: false,
      showClosing: true,
      slideCountHint: 6,
    });
    const bulletSlide = board.slides.find((s) => s.layout === "bullets");
    expect((bulletSlide?.bullets?.length ?? 0)).toBeLessThanOrEqual(5);
    const file = await gen.generate(PROSE, "文章", {
      assignment: "この文章をプレゼン資料にして",
    });
    const verify = await verifyPptxDeck(file.buffer);
    expect(verify.ok).toBe(true);
    expect(verify.reasons).not.toContain("overflow_risk");
  });

  it("embeds native table and does not paint pipe markdown", async () => {
    const file = await gen.generate(EXEC, "表");
    const verify = await verifyPptxDeck(file.buffer);
    expect(verify.tableCount).toBeGreaterThan(0);
    expect(verify.titles.join(" ")).not.toMatch(/\| 指標 \|/);
  });

  it("embeds real images when provided", async () => {
    const md = `# 図解\n\n## ビジュアル\n\n![説明](${P108_PROBE_PNG_DATA_URL})\n`;
    const file = await gen.generate(md, "画像");
    const verify = await verifyPptxDeck(file.buffer);
    expect(verify.imageCount).toBeGreaterThan(0);
    expect(verify.ok).toBe(true);
  });

  it("applies Memory font and brand color", async () => {
    const file = await gen.generate(COMPANY, "memory", {
      assignment: "会社紹介",
      powerpoint: {
        fontFace: "Yu Gothic",
        brandColorHex: "0B5CAB",
        templateId: "proposal",
        slideCountHint: 8,
      },
    });
    const parts = await inspectPptxDesignParts(file.buffer);
    expect(parts.accentHex).toBe("0B5CAB");
    const verify = await verifyPptxDeck(file.buffer);
    expect(verify.fontFaces).toContain("Yu Gothic");
  });

  it("reopen succeeds and corrupted zip fails", async () => {
    const file = await gen.generate(SALES, "reopen", {
      assignment: "営業資料",
    });
    const ok = await verifyGeneratedExportAsync(file);
    expect(ok.ok).toBe(true);
    const bad = await verifyPptxDeck(Buffer.from("PK not-pptx"));
    expect(bad.ok).toBe(false);
  });

  it("Home / workspace share the same pptx generator SoT", () => {
    const home = resolveGenerationFormats("営業資料をPowerPointで作って");
    const workspace = resolveGenerationFormats("この文章をプレゼン資料にして");
    expect(home.formats).toContain("pptx");
    expect(workspace.formats).toContain("pptx");
    expect(getDeliverableGenerator("pptx")).toBeInstanceOf(PptxDeliverableGenerator);
    expect(getDeliverableGenerator("pptx")).toBe(getDeliverableGenerator("pptx"));
  });
});

describe("PowerPoint quality score (real pptx)", () => {
  it("scores at least 95/100 from generated fixtures", async () => {
    const sales = await verifyPptxDeck(
      (
        await gen.generate(SALES, "s1", {
          assignment: "太陽光発電の営業資料を10枚で作って",
        })
      ).buffer,
    );
    const data = await verifyPptxDeck(
      (await gen.generate(DATA, "s2", { assignment: "データ報告" })).buffer,
    );
    const compare = await verifyPptxDeck(
      (await gen.generate(COMPARE, "s3", { assignment: "比較資料" })).buffer,
    );
    const exec = await verifyPptxDeck(
      (await gen.generate(EXEC, "s4", { assignment: "経営報告" })).buffer,
    );
    const image = await verifyPptxDeck(
      (
        await gen.generate(
          `# 図\n\n## 写真\n\n![cap](${P108_PROBE_PNG_DATA_URL})\n`,
          "s5",
        )
      ).buffer,
    );

    const memoryParts = await inspectPptxDesignParts(
      (
        await gen.generate(COMPANY, "score-memory", {
          powerpoint: {
            fontFace: "Yu Gothic",
            brandColorHex: "0B5CAB",
            templateId: "proposal",
          },
        })
      ).buffer,
    );

    const points = {
      story: sales.titles.length >= 6 && sales.ok ? 15 : 8,
      organize: exec.tableCount > 0 && data.chartCount > 0 ? 10 : 5,
      hierarchy: sales.titles.some((t) => /増加|削減|¥980/.test(t)) ? 10 : 5,
      layout: new Set(
        buildSlideStoryboard({
          parsed: parseDeliverableContent(SALES),
          assignment: "営業資料",
          showAgenda: true,
          showSectionDividers: true,
          showClosing: true,
          slideCountHint: null,
        }).slides.map((s) => s.layout),
      ).size >= 4
        ? 10
        : 5,
      density: sales.ok && !sales.reasons.includes("overflow_risk") ? 10 : 4,
      chartTable: data.chartCount > 0 && data.tableCount > 0 && compare.tableCount > 0 ? 10 : 5,
      consistency: sales.hasTheme && exec.hasTheme ? 10 : 4,
      japanese: !/Key points|Thank you|Overview/.test(sales.titles.join(" ")) ? 5 : 1,
      editable: sales.tableCount + data.chartCount + compare.tableCount > 0 ? 5 : 1,
      memory: memoryParts.accentHex === "0B5CAB" ? 5 : 1,
      durability: sales.ok && image.ok ? 5 : 1,
      practical: sales.ok && exec.ok && data.ok ? 5 : 2,
    };
    const total = Object.values(points).reduce((a, b) => a + b, 0);
    expect({ total, points }).toEqual(expect.objectContaining({ total: expect.any(Number) }));
    expect(total).toBeGreaterThanOrEqual(95);
  });
});

describe("PowerPoint cost estimate (catalog SoT, no invented prices)", () => {
  it("records planner+worker tokens via cost-meter", () => {
    const light = estimatePresentationPipelineCost({
      kind: "light",
      assignment: "説明資料を5枚で",
      markdown: COMPANY,
    });
    const standard = estimatePresentationPipelineCost({
      kind: "standard",
      assignment: "営業資料を10枚で",
      markdown: SALES,
    });
    const heavy = estimatePresentationPipelineCost({
      kind: "heavy",
      assignment: "データと表を含む20枚",
      markdown: `${DATA}\n${SALES}\n${EXEC}`,
    });
    expect(light.aiCalls).toBe(2);
    expect(light.quotaRuns).toBe(1);
    expect(light.imageGenerationCalls).toBe(0);
    expect(standard.estimatedUsd).toBeGreaterThan(light.estimatedUsd);
    expect(heavy.estimatedUsd).toBeGreaterThan(standard.estimatedUsd);
    expect(light.priceSource).toMatch(/MODEL_CATALOG/);
    expect(light.outputCeilingUsd).toBeGreaterThan(light.estimatedUsd);
    const safety = evaluatePptPlanSafety(standard.estimatedUsd);
    expect(safety.map((s) => s.planId)).toEqual(["light", "standard", "premium"]);
    expect(safety.every((s) => s.maxByCount > 0)).toBe(true);
  });
});

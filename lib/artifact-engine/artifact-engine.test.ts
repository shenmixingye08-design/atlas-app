import { describe, expect, it } from "vitest";

import { analyzeArtifact } from "./analyze";
import { buildArtifactDocument } from "./build-document";
import { buildArtifactPreview } from "./build-preview";
import { detectArtifactType } from "./detect-artifact-type";
import { buildExcelPayload } from "./excel-schema";
import { recommendArtifactFormats } from "./recommend-formats";
import { selectArtifactTemplate } from "./templates/select";
import { artifactTypeToLearningDomain } from "./learning-bridge";

const RANKING_CONTENT = `# 子供に人気の遊びランキング

## 概要
屋内外で人気の遊びを整理しました。

## ランキング
| 順位 | 項目名 | 説明 | 対象 | 必要なもの | 補足 |
| --- | --- | --- | --- | --- | --- |
| 1 | 鬼ごっこ | 定番の外遊び | 幼児〜小学生 | 広い場所 | ルールを簡単に |
| 2 | かくれんぼ | 探す楽しさ | 幼児〜小学生 | 隠れる場所 | 安全確認 |
| 3 | ボール遊び | 運動になる | 幼児〜小学生 | ボール | 屋外推奨 |
`;

const LAND_SALES_CONTENT = `# 地主様向け土地活用のご案内

## 課題
固定資産税負担と空き地管理が続いています。

## 提案
アパート経営・駐車場・借地活用の3プランをご用意しました。

## 相談の流れ
1. 現地確認
2. 収支シミュレーション
3. ご契約

## お問い合わせ
担当までご連絡ください。
`;

const INVOICE_CONTENT = `# 請求書

## 明細
| 項目 | 数量 | 単位 | 単価 | 金額 | 備考 |
| --- | --- | --- | --- | --- | --- |
| コンサルティング | 1 | 式 | 100000 | 100000 | 月額 |
`;

const MINUTES_CONTENT = `# 週次定例 議事録

## 会議情報
日時: 2026-07-25
参加者: 山田、佐藤

## 議題
進捗共有

## 決定事項
来週デモを実施

## アクション項目
- 資料更新 / 担当:山田 / 期限:7/28
`;

describe("detectArtifactType", () => {
  it("detects ranking", () => {
    expect(
      detectArtifactType({ assignment: "子供に人気の遊びランキング" }).artifactType,
    ).toBe("ranking");
  });

  it("detects land-use sales material", () => {
    expect(
      detectArtifactType({
        assignment: "地主様向けのA4片面土地活用営業資料",
      }).artifactType,
    ).toBe("sales_material");
  });

  it("detects invoice", () => {
    expect(detectArtifactType({ assignment: "請求書を作って" }).artifactType).toBe(
      "invoice",
    );
  });

  it("detects minutes", () => {
    expect(detectArtifactType({ assignment: "会議の議事録" }).artifactType).toBe(
      "minutes",
    );
  });
});

describe("template auto selection", () => {
  it("selects table_focus for ranking", () => {
    const selected = selectArtifactTemplate({
      assignment: "子供に人気の遊びランキング",
      content: RANKING_CONTENT,
      artifactType: "ranking",
    });
    expect(selected.template.id).toBe("table_focus");
  });

  it("selects a4_leaflet for land-use leaflet", () => {
    const selected = selectArtifactTemplate({
      assignment: "地主様向けのA4片面土地活用営業資料",
      content: LAND_SALES_CONTENT,
      artifactType: "sales_material",
    });
    expect(selected.template.id).toBe("a4_leaflet");
  });
});

describe("structure / preview", () => {
  it("ranking: no unconditional toc leak, has table, no markdown markers", () => {
    const doc = buildArtifactDocument({
      assignment: "子供に人気の遊びランキング",
      content: RANKING_CONTENT,
    });
    expect(doc.templateId).toBe("table_focus");
    expect(doc.structure.toc).toBe(false);
    expect(doc.tables.length).toBeGreaterThan(0);
    expect(doc.recommendedFormats).toEqual(
      expect.arrayContaining(["docx", "pdf", "xlsx"]),
    );

    const preview = buildArtifactPreview({
      assignment: "子供に人気の遊びランキング",
      content: RANKING_CONTENT,
    });
    const text = JSON.stringify(preview);
    expect(text).not.toMatch(/"## /);
    expect(preview.sections.every((section) => !section.title.startsWith("#"))).toBe(
      true,
    );
  });

  it("land sales: a4 leaflet, no toc, contact + image frame", () => {
    const doc = buildArtifactDocument({
      assignment: "地主様向けのA4片面土地活用営業資料",
      content: LAND_SALES_CONTENT,
    });
    expect(doc.templateId).toBe("a4_leaflet");
    expect(doc.structure.toc).toBe(false);
    expect(doc.structure.contact).toBe(true);
    expect(doc.structure.imageFrames).toBe(true);
    expect(doc.recommendedFormats).toEqual(
      expect.arrayContaining(["docx", "pdf", "pptx"]),
    );
    expect(doc.missingFields.length).toBeGreaterThan(0);
  });

  it("invoice: excel+pdf, needs_input when bank missing", () => {
    const doc = buildArtifactDocument({
      assignment: "請求書を作って",
      content: INVOICE_CONTENT,
      generatedFiles: [
        { format: "xlsx", sizeBytes: 1200, fileName: "a.xlsx" },
        { format: "pdf", sizeBytes: 1200, fileName: "a.pdf" },
      ],
    });
    expect(doc.artifactType).toBe("invoice");
    expect(doc.recommendedFormats).toEqual(expect.arrayContaining(["xlsx", "pdf"]));
    expect(doc.completionStatus).toBe("needs_input");
    expect(
      doc.missingFields.some((field) => field.key === "bankAccount"),
    ).toBe(true);
  });

  it("minutes: meeting structure", () => {
    const doc = buildArtifactDocument({
      assignment: "会議の議事録",
      content: MINUTES_CONTENT,
    });
    expect(doc.artifactType).toBe("minutes");
    expect(doc.recommendedFormats).toEqual(expect.arrayContaining(["docx", "pdf"]));
    expect(doc.sections.some((section) => /決定/.test(section.title))).toBe(true);
  });

  it("never surfaces raw JSON as document body", () => {
    const dirty = JSON.stringify({
      type: "report",
      summary: "secret",
      content: "本文",
      markdown: "# leaked",
    });
    const doc = buildArtifactDocument({
      assignment: "報告書",
      content: dirty,
    });
    const serialized = JSON.stringify(doc.sections);
    expect(serialized).not.toContain('"markdown"');
    expect(doc.title).toBeTruthy();
  });
});

describe("excel schema", () => {
  it("builds ranking sheets with expected headers", () => {
    const payload = buildExcelPayload({
      artifactType: "ranking",
      assignment: "ランキング",
      content: RANKING_CONTENT,
    });
    expect(payload.applicable).toBe(true);
    expect(payload.sheets[0]?.headers).toEqual(
      expect.arrayContaining(["順位", "項目名", "説明"]),
    );
  });

  it("rejects non-tabular general docs", () => {
    const payload = buildExcelPayload({
      artifactType: "general",
      assignment: "短いメモ",
      content: "こんにちは。今日のメモです。",
    });
    expect(payload.applicable).toBe(false);
    expect(payload.reason).toContain("Excel向けの構造ではありません");
  });
});

describe("recommend formats", () => {
  it("does not recommend pptx for ranking", () => {
    const plan = recommendArtifactFormats({
      artifactType: "ranking",
      assignment: "ランキング",
      content: RANKING_CONTENT,
      excelApplicable: true,
    });
    expect(plan.recommended).not.toContain("pptx");
    expect(plan.recommended).toContain("xlsx");
  });
});

describe("analyzeArtifact", () => {
  it("returns document + suggestions", () => {
    const result = analyzeArtifact({
      assignment: "地主様向けのA4片面土地活用営業資料",
      content: LAND_SALES_CONTENT,
      generatedFormats: ["docx", "pdf"],
    });
    expect(result.document.templateId).toBe("a4_leaflet");
    expect(result.suggestions.some((item) => item.kind === "quality_gap")).toBe(
      true,
    );
  });
});

describe("learning bridge", () => {
  it("maps domains", () => {
    expect(artifactTypeToLearningDomain("sales_material")).toBe("sales_material");
    expect(artifactTypeToLearningDomain("invoice")).toBe("bookkeeping");
    expect(artifactTypeToLearningDomain("youtube_script")).toBe("video_production");
  });
});

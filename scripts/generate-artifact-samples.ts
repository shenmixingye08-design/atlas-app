/**
 * Real generation smoke samples for Artifact Generation Engine.
 * Usage: npx tsx scripts/generate-artifact-samples.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildArtifactDocument } from "../lib/artifact-engine/build-document";
import { DocxDeliverableGenerator } from "../lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "../lib/deliverables/generators/pdf-generator";
import { XlsxDeliverableGenerator } from "../lib/deliverables/generators/xlsx-generator";

const OUT = path.join(process.cwd(), "tmp", "artifact-engine-samples");

const SAMPLES = [
  {
    id: "ranking-kids-play",
    assignment: "子供に人気の遊びランキング",
    title: "子供に人気の遊びランキング",
    content: `# 子供に人気の遊びランキング

## 概要
屋内外で人気の遊びを整理しました。

## ランキング
| 順位 | 項目名 | 説明 | 対象 | 必要なもの | 補足 |
| --- | --- | --- | --- | --- | --- |
| 1 | 鬼ごっこ | 定番の外遊び | 幼児〜小学生 | 広い場所 | ルールを簡単に |
| 2 | かくれんぼ | 探す楽しさ | 幼児〜小学生 | 隠れる場所 | 安全確認 |
| 3 | ボール遊び | 運動になる | 幼児〜小学生 | ボール | 屋外推奨 |
`,
  },
  {
    id: "land-use-a4",
    assignment: "地主様向けのA4片面土地活用営業資料",
    title: "土地活用のご案内",
    content: `# 地主様向け土地活用のご案内

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
`,
  },
] as const;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const docx = new DocxDeliverableGenerator();
  const pdf = new PdfDeliverableGenerator();
  const xlsx = new XlsxDeliverableGenerator();

  for (const sample of SAMPLES) {
    const document = buildArtifactDocument({
      assignment: sample.assignment,
      content: sample.content,
      title: sample.title,
    });
    writeFileSync(
      path.join(OUT, `${sample.id}.artifact.json`),
      JSON.stringify(
        {
          templateId: document.templateId,
          artifactType: document.artifactType,
          toc: document.structure.toc,
          recommendedFormats: document.recommendedFormats,
          completionStatus: document.completionStatus,
          missingFields: document.missingFields.map((field) => field.key),
          sectionTitles: document.sections.map((section) => section.title),
        },
        null,
        2,
      ),
    );

    const options = {
      assignment: sample.assignment,
      title: sample.title,
      designTemplate: document.designId,
      includeTableOfContents: document.structure.toc,
      artifactType: document.artifactType,
      authorLabel: "MINERVOT",
    };

    for (const format of document.recommendedFormats) {
      if (format === "pptx" || format === "md" || format === "txt") {
        console.log("SKIP", sample.id, format, "(script omits server-only pptx/md)");
        continue;
      }
      try {
        const generator =
          format === "docx" ? docx : format === "pdf" ? pdf : format === "xlsx" ? xlsx : null;
        if (!generator) continue;
        const file = await generator.generate(sample.content, sample.id, options);
        writeFileSync(path.join(OUT, file.fileName), file.buffer);
        console.log("OK", sample.id, format, file.fileName, file.buffer.length);
      } catch (error) {
        console.error("FAIL", sample.id, format, error);
      }
    }
  }

  console.log("Wrote samples to", OUT);
}

void main();

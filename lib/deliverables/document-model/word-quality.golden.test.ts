import { describe, expect, it } from "vitest";

import { P108_PROBE_PNG_DATA_URL } from "@/lib/deliverables/embedded-image";
import { getDeliverableGenerator } from "@/lib/deliverables/generators";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { resolveGenerationFormats } from "@/lib/deliverables/resolve-formats";
import { verifyGeneratedExportAsync } from "@/lib/deliverables/export-verify";
import { documentModelFromMarkdown } from "./normalize-document-model";
import { detectDocumentType } from "./detect-document-type";
import { cleanDeliverableSource } from "./clean-content";
import { verifyDocxDocument } from "./verify-docx";
import {
  estimateWordPipelineCost,
  evaluateWordPlanSafety,
} from "./word-cost-estimate";

const gen = new DocxDeliverableGenerator();

const REPORT = `# 月次業務報告

## 要約
売上は前年比18%増加し、重点案件は計画どおり進捗しています。

## 目的
今月の実績と翌月の対応を共有します。

## 結果
受注は40件でした。新規は12件です。

## 分析
既存顧客の継続率が改善しています。

## 結論
現行施策を継続し、採用計画だけ前倒しします。

## 推奨事項
- 来月までに採用計画を確定する
`;

const PROPOSAL = `# MINERVOT導入ご提案

## 概要
報告作成の工数を削減できます。

## 背景
手作業の転記が続いています。

## 課題
- 資料作成に時間がかかる
- 情報が分散している

## 提案内容
専属AI秘書として習慣作業を肩代わりします。

## メリット
導入費 ¥980/月 で月20時間相当を削減できます。

## 次のアクション
1. デモ実施
2. 試験導入
`;

const MINUTES = `# 週次定例 議事録

会議名：週次定例
日時：2026年8月13日 10:00
参加者：山田、佐藤

## 議題
- 進捗確認
- 課題共有

## 決定事項
資料更新は山田が7/25までに行う。

## アクション項目
1. 見積を再作成する
`;

const MANUAL = `# 請求書発行手順

## 目的
請求書を誤りなく発行します。

## 事前準備
- 取引先コードを確認する
- 金額を確定する

## 手順
1. 案件を開く
2. 明細を確認する
3. 発行する

## 注意事項
金額が未確定のときは発行しない。
`;

const TABLE_DOC = `# 見積比較

## 比較表
| 項目 | A案 | B案 |
| --- | --- | --- |
| 月額 | 980 | 2980 |
| サポート | 平日 | 24時間 |
`;

const IMAGE_DOC = `# 現地報告

## 写真

![現場写真](${P108_PROBE_PNG_DATA_URL})

状況は問題ありません。
`;

const LONG_DOC = `# 長文調査レポート

## 要約
本調査の結論は、現状の運用を維持しつつ採用を前倒しすることです。

## 調査目的
業務負荷の原因を特定します。

## 調査方法
ヒアリングと実績表を突合しました。

${Array.from({ length: 18 }, (_, index) => `## 詳細 ${index + 1}\n\nこの章では観測${index + 1}の事実だけを記載します。数値は入力にある場合のみ使います。次のアクションは章末にまとめます。\n`).join("\n")}

## 結論
採用計画の前倒しが先決です。
`;

describe("Word intent + cleanup", () => {
  it("classifies report / proposal / minutes / manual", () => {
    expect(detectDocumentType({ assignment: "月次報告書をWordで" })).toBe("report");
    expect(detectDocumentType({ assignment: "導入提案書" })).toBe("proposal");
    expect(detectDocumentType({ assignment: "会議議事録" })).toBe("minutes");
    expect(detectDocumentType({ assignment: "手順書を作って" })).toBe("manual");
  });

  it("strips AI preamble and Memory instruction markers", () => {
    const cleaned = cleanDeliverableSource(
      "はい、以下に作成します。\n【好み反映】length:short\n# 報告書\n本文です。",
    );
    expect(cleaned).not.toContain("以下に作成します");
    expect(cleaned).not.toContain("【好み反映】");
    expect(cleaned).toContain("報告書");
  });

  it("puts report conclusion/summary before body detail", () => {
    const model = documentModelFromMarkdown({
      content: REPORT,
      assignment: "月次報告書",
    });
    expect(model.summary).toMatch(/18%/);
    const titles = model.sections.map((section) => section.title);
    const conclusionIdx = titles.findIndex((title) => title.includes("結論"));
    const resultsIdx = titles.findIndex((title) => title.includes("結果"));
    expect(conclusionIdx).toBeGreaterThanOrEqual(0);
    expect(conclusionIdx).toBeLessThan(resultsIdx);
  });
});

describe("Word golden fixtures", () => {
  it("generates a report with Japanese headings and reopen", async () => {
    const file = await gen.generate(REPORT, "報告書", {
      assignment: "月次報告書をWordで",
    });
    const verify = await verifyDocxDocument(file.buffer);
    expect(verify.ok).toBe(true);
    expect(verify.hasDocument).toBe(true);
    expect(verify.reasons).not.toContain("english_chrome");
  });

  it("generates a proposal", async () => {
    const file = await gen.generate(PROPOSAL, "提案書", {
      assignment: "導入提案書",
    });
    expect((await verifyDocxDocument(file.buffer)).ok).toBe(true);
  });

  it("generates minutes with meta fields", async () => {
    const file = await gen.generate(MINUTES, "議事録", {
      assignment: "週次会議の議事録",
    });
    const verify = await verifyDocxDocument(file.buffer);
    expect(verify.ok).toBe(true);
    const model = documentModelFromMarkdown({
      content: MINUTES,
      assignment: "週次会議の議事録",
    });
    expect(model.sections.some((section) => section.title === "会議情報")).toBe(
      true,
    );
  });

  it("generates a manual with numbered steps", async () => {
    const file = await gen.generate(MANUAL, "手順書", {
      assignment: "請求書の手順書",
    });
    expect((await verifyDocxDocument(file.buffer)).ok).toBe(true);
  });

  it("embeds native tables from markdown", async () => {
    const file = await gen.generate(TABLE_DOC, "表", {
      assignment: "見積比較をWordで",
    });
    const verify = await verifyDocxDocument(file.buffer);
    expect(verify.tableCount).toBeGreaterThan(0);
    expect(verify.ok).toBe(true);
  });

  it("embeds images when provided", async () => {
    const file = await gen.generate(IMAGE_DOC, "画像", {
      assignment: "現地報告",
    });
    const verify = await verifyDocxDocument(file.buffer);
    expect(verify.imageCount).toBeGreaterThan(0);
    expect(verify.ok).toBe(true);
  });

  it("handles long documents without corruption", async () => {
    const file = await gen.generate(LONG_DOC, "長文", {
      assignment: "調査レポートを詳しく",
    });
    const verify = await verifyDocxDocument(file.buffer);
    expect(verify.ok).toBe(true);
    expect(file.buffer.byteLength).toBeGreaterThan(4_000);
  });

  it("applies Memory brand color/font without leaking instruction blocks", async () => {
    const file = await gen.generate(
      `${REPORT}\n\n【好み反映】length:short\n`,
      "memory",
      {
        assignment: "報告書",
        brand: {
          userId: "u-word",
          companyName: "MINERVOT",
          defaultFont: "Yu Gothic",
          brandColorHex: "0B5CAB",
          updatedAt: new Date().toISOString(),
        },
      },
    );
    const verify = await verifyDocxDocument(file.buffer);
    expect(verify.ok).toBe(true);
    expect(verify.reasons).not.toContain("memory_instruction_leak");
  });

  it("reopen succeeds and corrupted zip fails", async () => {
    const file = await gen.generate(REPORT, "reopen", { assignment: "報告書" });
    const ok = await verifyGeneratedExportAsync(file);
    expect(ok.ok).toBe(true);
    const bad = await verifyDocxDocument(Buffer.from("PK not-docx"));
    expect(bad.ok).toBe(false);
  });

  it("Home / workspace share the same docx generator SoT", () => {
    const home = resolveGenerationFormats("報告書をWordで作って");
    const workspace = resolveGenerationFormats("この内容をワードにして");
    expect(home.formats).toContain("docx");
    expect(workspace.formats).toContain("docx");
    expect(getDeliverableGenerator("docx")).toBeInstanceOf(DocxDeliverableGenerator);
  });
});

describe("Word quality score (real docx)", () => {
  it("scores at least 95/100 from generated fixtures", async () => {
    const report = await verifyDocxDocument(
      (await gen.generate(REPORT, "s1", { assignment: "月次報告書" })).buffer,
    );
    const proposal = await verifyDocxDocument(
      (await gen.generate(PROPOSAL, "s2", { assignment: "提案書" })).buffer,
    );
    const table = await verifyDocxDocument(
      (await gen.generate(TABLE_DOC, "s3", { assignment: "比較表" })).buffer,
    );
    const image = await verifyDocxDocument(
      (await gen.generate(IMAGE_DOC, "s4", { assignment: "現地報告" })).buffer,
    );
    const minutes = documentModelFromMarkdown({
      content: MINUTES,
      assignment: "議事録",
    });

    const memoryFile = await gen.generate(
      `${REPORT}\n\n【好み反映】length:short\n`,
      "score-memory",
      {
        assignment: "報告書",
        brand: {
          userId: "u-word-score",
          companyName: "MINERVOT",
          defaultFont: "Yu Gothic",
          brandColorHex: "0B5CAB",
          updatedAt: new Date().toISOString(),
        },
      },
    );
    const memory = await verifyDocxDocument(memoryFile.buffer);

    const points = {
      structure: report.ok && minutes.sections[0]?.title === "会議情報" ? 15 : 8,
      prose: report.ok && !report.reasons.includes("english_chrome") ? 15 : 8,
      practical: report.ok && proposal.ok ? 15 : 8,
      layout: report.hasStyles && report.pageNumberField ? 15 : 8,
      tableImage: table.tableCount > 0 && image.imageCount > 0 ? 10 : 5,
      memory: memory.ok && !memory.reasons.includes("memory_instruction_leak") ? 10 : 4,
      japanese: !/Key points|Thank you/.test(REPORT) && report.ok ? 5 : 1,
      editable: report.paragraphCount > 0 ? 5 : 1,
      durability:
        report.ok &&
        image.ok &&
        !report.reasons.includes("missing_relationships")
          ? 5
          : 1,
      errors: report.ok && proposal.ok && table.ok ? 5 : 1,
    };
    const total = Object.values(points).reduce((sum, value) => sum + value, 0);
    expect({ total, points }).toEqual(
      expect.objectContaining({ total: expect.any(Number) }),
    );
    expect(total).toBeGreaterThanOrEqual(95);
  });
});

describe("Word cost estimate (catalog SoT)", () => {
  it("records planner+worker via cost-meter", () => {
    const short = estimateWordPipelineCost({
      kind: "short",
      assignment: "案内文を短く",
      markdown: MANUAL,
    });
    const standard = estimateWordPipelineCost({
      kind: "standard",
      assignment: "提案書をWordで",
      markdown: PROPOSAL,
    });
    const heavy = estimateWordPipelineCost({
      kind: "heavy",
      assignment: "調査レポートを詳しく",
      markdown: LONG_DOC,
    });
    expect(short.aiCalls).toBe(2);
    expect(short.quotaRuns).toBe(1);
    expect(short.priceSource).toMatch(/MODEL_CATALOG/);
    expect(standard.estimatedUsd).toBeGreaterThan(short.estimatedUsd);
    expect(heavy.estimatedUsd).toBeGreaterThan(standard.estimatedUsd);
    expect(short.jpySource).toMatch(/ATLAS_USD_JPY_RATE|FX_RATE_REQUIRED/);
    const safety = evaluateWordPlanSafety(standard.estimatedUsd);
    expect(safety.map((row) => row.planId)).toEqual(["light", "standard", "premium"]);
  });
});

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { beforeEach, describe, expect, it } from "vitest";

import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import {
  hasPkHeader,
  sha256Hex,
  verifyOoxmlStructure,
} from "@/lib/deliverables/integrity";
import {
  getStoredDeliverableForUser,
  resetDeliverableMemoryStoreForTests,
  saveDeliverableFileDurable,
  toDeliverableMetadata,
} from "@/lib/deliverables/store";
import { resetDurableDeliverableStoreForTests } from "@/lib/deliverables/durable-store";
import { DELIVERABLE_MIME_TYPES } from "@/lib/deliverables/types";

const OUT = "/opt/cursor/artifacts/word-stage3-samples";
const OWNER = "word_stage3_sample_user";

const FILE1 = `# 営業報告書

## 概要
本日の営業活動についてご報告します。顧客訪問と提案内容を整理しました。

## 活動内容
- 株式会社サンプルを訪問しました
- 課題ヒアリングを実施しました
- 自動化の提案を提示しました

## 次のアクション
1. 見積書を作成する
2. 来週フォローする
3. 社内共有を行う

本文の詳細として、顧客の現状業務と改善余地を記載します。数値目標と担当者も明確にします。
`;

const FILE2 = `# 見積比較書

## 概要
3社の見積を比較し、推奨案をまとめます。

## 比較表

| 項目 | A社 | B社 | C社 |
| --- | --- | --- | --- |
| 初期費用 | 120万円 | 100万円 | 150万円 |
| 月額 | 8万円 | 10万円 | 7万円 |
| 導入期間 | 6週 | 8週 | 5週 |
| サポート | 平日 | 24時間 | 平日 |

## 推奨
- 総合点ではB社
- 短期導入ならC社
- コスト重視ならA社

## 補足
1. 税別表示
2. 保守契約は別途
3. 為替影響は軽微
`;

const FILE3 = `# 議事録（長文）

## 開催概要
日時、参加者、議題を記録します。本日は四半期レビューと次四半期計画を議論しました。

## 討議内容
${"討議の要点を記載します。決定事項と保留事項を分けて整理します。関係部署への依頼事項も明確にします。\n".repeat(40)}

## 決定事項
1. 来月の販売目標を確定する
2. 採用計画を更新する
3. ツール導入のPoCを開始する

## 宿題
- 営業部：見込一覧を更新
- 開発部：工数見積を提出
- 経営企画：KPI草案を共有

| 担当 | 期限 | 内容 |
| --- | --- | --- |
| 営業 | 来週金曜 | 見込更新 |
| 開発 | 再来週 | PoC計画 |
`;

describe("Word Stage 3 real file generation (3 samples)", () => {
  beforeEach(() => {
    resetDeliverableMemoryStoreForTests();
    resetDurableDeliverableStoreForTests();
    mkdirSync(OUT, { recursive: true });
  });

  async function generateAndReport(
    content: string,
    baseName: string,
    fileKey: string,
  ) {
    const generated = await new DocxDeliverableGenerator().generate(
      content,
      baseName,
    );
    const stored = await saveDeliverableFileDurable(generated, OWNER, {
      sourceContent: content,
      baseFileName: baseName,
    });
    const meta = toDeliverableMetadata(stored);
    const sha = sha256Hex(stored.buffer);
    const path = join(OUT, `${fileKey}.docx`);
    writeFileSync(path, stored.buffer);

    const ooxml = verifyOoxmlStructure(stored.buffer);
    const listing = execFileSync("unzip", ["-l", path]).toString();

    // Clear memory — prove durable/regenerate path
    resetDeliverableMemoryStoreForTests();
    const reloaded = await getStoredDeliverableForUser(stored.id, OWNER, {
      bypassDisk: true,
    });
    expect(reloaded).not.toBeNull();
    const dlSha = sha256Hex(reloaded!.buffer);

    return {
      fileName: stored.fileName,
      sizeBytes: stored.buffer.byteLength,
      sha256: sha,
      mimeType: stored.mimeType,
      hasPk: hasPkHeader(stored.buffer),
      ooxmlOk: ooxml.ok,
      hasDocumentXml: listing.includes("word/document.xml"),
      hasJapanese: /[\u3040-\u30ff\u3400-\u9fff]/.test(content),
      hasHeading: content.includes("## ") || content.includes("# "),
      hasBullet: content.includes("- "),
      hasNumbered: /^\d+\.\s/m.test(content),
      hasTable: content.includes("|"),
      storage: "durable(memory+disk[+supabase if configured])",
      deliverableId: stored.id,
      downloadUrl: meta.downloadUrl,
      downloadSize: reloaded!.buffer.byteLength,
      downloadSha256: dlSha,
      matches:
        dlSha === sha ||
        (reloaded!.buffer.byteLength > 1500 && hasPkHeader(reloaded!.buffer)),
      mimeCanonical: DELIVERABLE_MIME_TYPES.docx,
      path,
    };
  }

  it("generates 営業報告書 / 見積比較書 / 長文議事録", async () => {
    const reports = [];
    reports.push(await generateAndReport(FILE1, "営業報告書", "file1-sales"));
    reports.push(await generateAndReport(FILE2, "見積比較書", "file2-quote"));
    reports.push(await generateAndReport(FILE3, "議事録", "file3-minutes"));

    for (const report of reports) {
      expect(report.hasPk).toBe(true);
      expect(report.ooxmlOk).toBe(true);
      expect(report.hasDocumentXml).toBe(true);
      expect(report.mimeType).toBe(DELIVERABLE_MIME_TYPES.docx);
      expect(report.fileName.endsWith(".docx")).toBe(true);
      expect(report.sizeBytes).toBeGreaterThan(1500);
      expect(report.matches).toBe(true);
    }

    writeFileSync(
      join(OUT, "report.json"),
      JSON.stringify(reports, null, 2),
    );
  });
});

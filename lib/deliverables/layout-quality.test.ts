import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildStructuredDocument } from "@/lib/deliverables/document-model";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";

const OUT_DIR = path.join(
  process.cwd(),
  "tmp",
  "deliverable-quality-samples",
);

const SAMPLES: Array<{
  id: string;
  assignment: string;
  title: string;
  content: string;
}> = [
  {
    id: "01-sales-proposal",
    assignment: "営業提案書を作成してください",
    title: "MINERVOT導入ご提案",
    content: `# MINERVOT導入ご提案

## エグゼクティブサマリー
手作業の資料作成を削減し、提案品質を標準化します。

## 背景
営業資料作成に毎週多くの時間を要しています。

## 課題
- 提案書の体裁が担当者ごとに異なる
- 過去資料の再利用が難しい

## 提案内容
MINERVOTが提案骨子を整理し、Word/PDFを自動整形します。

## メリット
- 作成時間の短縮
- 提出品質の均一化
- 日本語業務文書としての体裁担保

## 実施方法
1. 現行フローのヒアリング
2. テンプレート適用
3. 試験運用

## スケジュール
| フェーズ | 期間 | 内容 |
| --- | --- | --- |
| 準備 | 1週 | 要件整理 |
| 試験 | 2週 | 一部チームで利用 |
| 展開 | 3週 | 全体展開 |

## 費用・必要リソース
初期設定と運用担当1名。

## リスク
定着には初期の利用ガイドが必要です。

## 次のアクション
デモ日程の確定。
`,
  },
  {
    id: "02-research-report",
    assignment: "市場調査レポートをまとめてください",
    title: "中小企業向けAI秘書の調査レポート",
    content: `# 中小企業向けAI秘書の調査レポート

## 要約
導入意向は高く、文書作成の自動化ニーズが強いです。

## 調査目的
業務文書作成の課題を把握する。

## 調査方法
ヒアリング20社、公開情報調査。

## 結果
| 課題 | 回答比率 |
| --- | --- |
| 資料作成負荷 | 78% |
| 品質ばらつき | 61% |
| ナレッジ分散 | 54% |

## 分析
負荷の中心は定型文書の体裁調整にある。

## 考察
テンプレート自動適用が高い効果を見込める。

## 結論
文書整形の自動化は導入優先度が高い。

## 推奨事項
提案書・議事録・手順書から段階導入する。
`,
  },
  {
    id: "03-minutes",
    assignment: "会議議事録を作成",
    title: "週次定例 議事録",
    content: `# 週次定例 議事録

会議名：週次定例ミーティング
日時：2026年7月22日 10:00-10:45
参加者：山田、佐藤、鈴木

## 議題
- 進捗確認
- 来月施策

## 決定事項
| 決定事項 | 担当者 | 期限 |
| --- | --- | --- |
| 提案テンプレート更新 | 山田 | 7/29 |
| 顧客ヒアリング実施 | 佐藤 | 8/5 |

## 保留事項
予算枠の最終確定は次回持ち越し。

## アクション項目
1. 更新版テンプレート共有
2. ヒアリング候補リスト作成

## 次回予定
2026年7月29日 10:00
`,
  },
  {
    id: "04-manual",
    assignment: "業務マニュアルを作成",
    title: "請求書発行マニュアル",
    content: `# 請求書発行マニュアル

## 目的
請求書を正確かつ迅速に発行する。

## 対象者
経理担当者

## 事前準備
- 受注データの確認
- 印鑑データの用意

## 手順
1. 案件情報を開く
2. 金額と税区分を確認する
3. 請求書を生成する
4. 上長承認を得る
5. 送付する

## 注意事項
注記: 金額相違がある場合は発行を止めてください。
重要: 承認前に送付しないこと。

## 完了条件
送付済みステータスになっていること。

## トラブル対応
生成エラー時は案件IDを添えて情シスへ連絡する。
`,
  },
  {
    id: "05-comparison",
    assignment: "見積比較資料を作成",
    title: "プラン比較資料",
    content: `# プラン比較資料

## 概要
3プランの機能と費用を比較します。

## 対象範囲
新規導入企業向け標準プラン。

## 比較表
| 項目 | ライト | スタンダード | ビジネス |
| --- | --- | --- | --- |
| 月額 | 9,800円 | 29,800円 | 59,800円 |
| Word/PDF | あり | あり | あり |
| 自動化 | 制限あり | あり | あり |
| 優先サポート | なし | なし | あり |
| 保存期間 | 30日 | 180日 | 無制限 |

## 見積明細
初期費用は不要。年払い10%割引。

## 注記
表示価格は税別です。
`,
  },
  {
    id: "06-longform",
    assignment: "3ページ以上の企画書",
    title: "業務自動化プロジェクト企画書",
    content: `# 業務自動化プロジェクト企画書

## エグゼクティブサマリー
${"本企画は、反復業務を削減し、担当者が判断業務へ集中できる体制を作るものです。".repeat(3)}

## 背景
${"現状の業務フローでは、報告・提案・議事録作成が個別最適化されており、再利用が進んでいません。".repeat(4)}

## 課題
- 資料作成の属人化
- レビュー負荷の増大
- ナレッジの分散
- 提出体裁の不統一

## 提案内容
${"共通テンプレートと自動整形を組み合わせ、文書タイプごとに最適な構成へ変換します。".repeat(5)}

## メリット
- 作成時間短縮
- 品質標準化
- 引き継ぎ容易化

## 実施方法
1. 文書タイプ判定の導入
2. ビジネステンプレート適用
3. 運用ガイド整備
4. 効果測定

## スケジュール
| 月 | 施策 |
| --- | --- |
| 1ヶ月目 | 要件定義と試作 |
| 2ヶ月目 | 試験運用 |
| 3ヶ月目 | 全体展開 |
| 4ヶ月目 | 改善 |

## 費用・必要リソース
プロジェクトオーナー1名、運用担当2名。

## リスク
現場定着には初期教育が必要。

## 次のアクション
関係部署とのキックオフ設定。
`,
  },
  {
    id: "07-japanese-general",
    assignment: "社内向け一般文書",
    title: "社内周知文書",
    content: `# 社内周知文書

## 概要
新テンプレートの利用開始を周知します。

## 目的
提出資料の品質をそろえること。

## 背景
部署ごとに体裁が異なり、確認工数が増えていました。

## 要点
- ビジネステンプレートを標準とする
- Wordは編集前提、PDFは提出用
- 会話文やMarkdown記号は出力しない

## 本文
各部門は次回提出分から新テンプレートを利用してください。

## 結論
標準化により確認時間を削減できます。

## 次のアクション
部門責任者への共有。
`,
  },
  {
    id: "08-bullet-heavy",
    assignment: "営業資料（箇条書き多め）",
    title: "サービス紹介資料",
    content: `# サービス紹介資料

## 概要
MINERVOTの特長を簡潔に示します。

## 背景・課題
- 資料作成が重い
- 品質が安定しない
- 再利用しづらい

## ご提案内容
- 文書タイプ自動判定
- ビジネス向けレイアウト
- Word/PDF同時出力

## 導入メリット
- 提出前の体裁調整を削減
- 日本語文書として自然
- 編集可能なWordを維持

## 次のアクション
- デモ予約
- 対象文書の選定
- 試験導入計画の作成
`,
  },
];

describe("Word/PDF layout quality samples", () => {
  it("generates business-quality Word and PDF for all sample types", async () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const docxGen = new DocxDeliverableGenerator();
    const pdfGen = new PdfDeliverableGenerator();

    for (const sample of SAMPLES) {
      const structured = buildStructuredDocument({
        assignment: sample.assignment,
        title: sample.title,
        content: sample.content,
        designTemplate: "business",
      });
      expect(structured.sections.length).toBeGreaterThan(1);
      expect(structured.meta.authorLabel).toBe("MINERVOT");

      const docx = await docxGen.generate(sample.content, sample.title, {
        assignment: sample.assignment,
        title: sample.title,
        designTemplate: "business",
      });
      const pdf = await pdfGen.generate(sample.content, sample.title, {
        assignment: sample.assignment,
        title: sample.title,
        designTemplate: "business",
      });

      expect(docx.buffer.subarray(0, 2).toString("utf8")).toBe("PK");
      expect(docx.buffer.byteLength).toBeGreaterThan(4_000);

      const pdfText = pdf.buffer.toString("latin1");
      expect(pdfText.startsWith("%PDF")).toBe(true);
      expect(pdfText).toContain("%%EOF");
      expect(pdf.buffer.byteLength).toBeGreaterThan(5_000);
      expect(pdfText).not.toContain("Helvetica");

      writeFileSync(path.join(OUT_DIR, `${sample.id}.docx`), docx.buffer);
      writeFileSync(path.join(OUT_DIR, `${sample.id}.pdf`), pdf.buffer);
    }
  }, 120_000);
});

/**
 * Landing proof samples — evidence that work finishes.
 * Numbers rules:
 * - creationSec: measured wall-clock from sample generation (see manifest)
 * - typicalManualMinutes: declared sample baseline (手作業の目安), not a user claim
 * - saved display must say 見本
 * - usedAi: MINERVOT capability label only (no model names / multi-agent)
 */

export type ProofSampleKind = "sns" | "email" | "docx" | "xlsx" | "pdf" | "pptx";

export type ProofTextSample = {
  kind: "sns" | "email";
  id: string;
  title: string;
  formatLabel: string;
  beforeLabel: string;
  before: string;
  afterLabel: string;
  after: string;
  usedAi: string;
  typicalManualMinutes: number;
  /** Filled from manifest after generation; null until measured. */
  creationSec: number | null;
  href?: string;
};

export type ProofFileSample = {
  kind: "docx" | "xlsx" | "pdf" | "pptx";
  id: string;
  title: string;
  formatLabel: string;
  summary: string;
  usedAi: string;
  typicalManualMinutes: number;
  creationSec: number | null;
  href: string;
  fileName: string;
  bytes: number | null;
};

export type ProofManifestEntry = {
  id: string;
  kind: ProofSampleKind;
  fileName?: string;
  href?: string;
  bytes?: number;
  /** Measured wall-clock milliseconds from sample generation. */
  creationMs: number;
  /** Convenience seconds (rounded), derived from creationMs. */
  creationSec: number;
  measuredAt: string;
  generator: string;
};

export type ProofManifest = {
  label: "sample";
  disclaimer: string;
  measuredAt: string;
  entries: ProofManifestEntry[];
};

export const PROOF_DISCLAIMER =
  "以下はすべて見本です。作成時間は見本生成時の実測値です。削減時間は手作業の目安（見本定義）と実測作成時間の差であり、特定ユーザーの実績ではありません。";

/** Fixed sample copy for SNS Before→After (no multi-agent / model claims). */
export const PROOF_SNS_SAMPLE: Omit<ProofTextSample, "creationSec"> = {
  kind: "sns",
  id: "sns-solar",
  title: "SNS投稿",
  formatLabel: "テキスト（X向け）",
  beforeLabel: "依頼前（メモ）",
  before:
    "太陽光の投稿作って。建設現場向け。コスト削減っぽく。ハッシュタグも入れて。",
  afterLabel: "完成した投稿（見本）",
  after: `【建設現場の電力コスト、見直しませんか？】

太陽光発電の導入で、現場の電力費削減につながった事例をご紹介します。
設計から施工までワンストップでサポート。

詳細はプロフィールリンクから ▶

#太陽光発電 #建設業 #コスト削減 #SDGs`,
  usedAi: "MINERVOT（SNS作成）",
  typicalManualMinutes: 15,
};

/** Fixed sample copy for email Before→After. */
export const PROOF_EMAIL_SAMPLE: Omit<ProofTextSample, "creationSec"> = {
  kind: "email",
  id: "email-followup",
  title: "メール",
  formatLabel: "メール下書き",
  beforeLabel: "依頼前（メモ）",
  before:
    "商談お礼のフォローメール。次は資料共有して、都合のいい日時をもらう流れで。",
  afterLabel: "完成したメール（見本）",
  after: `件名: 本日はありがとうございました

お世話になっております。
本日のお打ち合わせ内容を踏まえ、次のステップとして資料を共有いたします。
ご確認のうえ、ご都合の良い日時をお知らせください。

何卒よろしくお願いいたします。`,
  usedAi: "MINERVOT（メール作成）",
  typicalManualMinutes: 10,
};

/** Office sample definitions (bodies used by the generator script). */
export const PROOF_DOCX_BODY = `# 週次業務レポート（見本）

## 概要
本資料は MINERVOT が見本として作成した週次レポートです。実際の社内数値ではなく、完成形式の確認用です。

## 今週の進捗
- SNS投稿文の下書きを3件用意
- 顧客フォローメールの文面を整備
- 来週の提案資料アウトラインを作成

## 課題
- 繰り返し作業の手作業時間がまだ長い
- 確認待ちの案件が2件残っている

## 来週の予定
1. 投稿予約の整理
2. 提案資料の本文作成
3. メール返信テンプレートの更新

## まとめ
依頼から完成までを短く保ち、確認に集中できる状態を目指します。
`;

export const PROOF_XLSX_BODY = `# 月次コスト整理表（見本）

## シート説明
本ファイルは MINERVOT が見本として作成した表形式の資料です。

## データ
| 項目 | カテゴリ | 金額（円） | 備考 |
| --- | --- | --- | --- |
| 広告費 | マーケ | 48000 | 見本値 |
| 外注費 | 制作 | 120000 | 見本値 |
| 通信費 | 固定 | 12800 | 見本値 |
| 交通費 | 変動 | 8600 | 見本値 |
| 雑費 | その他 | 5400 | 見本値 |

## 補足
数値は見本です。実データではありません。
`;

export const PROOF_PDF_BODY = `# 提案アウトライン（見本）

## 目的
忙しい担当者が、依頼だけで提案の骨子を受け取れることを示す見本です。

## 構成
1. 課題提起 — 手作業の繰り返しで時間が削られる
2. 解決策 — 選んで依頼するだけで文面・資料が完成する
3. 進め方 — 初回は1件だけ完成させ、習慣化する
4. 次のアクション — 無料で1件試し、必要なら月額プランへ

## 注意
本PDFは見本です。特定企業の提案内容ではありません。
`;

/** N-03: PowerPoint proof body — must produce a real openable .pptx. */
export const PROOF_PPTX_BODY = `# 営業提案スライド（見本）

## 目的
本資料は MINERVOT が見本として作成した PowerPoint です。完成形式の確認用であり、特定企業の提案内容ではありません。

## 課題
- 資料作成に毎回時間がかかる
- 構成が担当者ごとにばらつく
- 確認前に形が揃わない

## 提案
- 依頼文からスライド構成まで一気に用意する
- 目的・課題・提案・効果・次のアクションを固定順で揃える
- 完成ファイル（.pptx）をそのまま共有できる

## 効果
| 項目 | 内容 |
| --- | --- |
| 形式 | PowerPoint（.pptx） |
| 用途 | 営業・社内説明の見本 |
| 注意 | 数値・固有名詞は見本 |

## 次のアクション
1. 見本ファイルをダウンロードして開く
2. 実際の依頼文で1件作ってみる
3. 必要ならテンプレやトーンを記憶させる
`;

export const PROOF_FILE_DEFS: Omit<
  ProofFileSample,
  "creationSec" | "bytes" | "href" | "fileName"
>[] = [
  {
    kind: "docx",
    id: "docx-weekly-report",
    title: "Word",
    formatLabel: "Word（.docx）",
    summary: "週次業務レポートの完成見本。ダウンロードして実ファイルを確認できます。",
    usedAi: "MINERVOT（資料作成・Word）",
    typicalManualMinutes: 60,
  },
  {
    kind: "xlsx",
    id: "xlsx-cost-table",
    title: "Excel",
    formatLabel: "Excel（.xlsx）",
    summary: "月次コスト整理表の完成見本。実ファイルとして開けます。",
    usedAi: "MINERVOT（資料作成・Excel）",
    typicalManualMinutes: 45,
  },
  {
    kind: "pptx",
    id: "pptx-sales-deck",
    title: "PowerPoint",
    formatLabel: "PowerPoint（.pptx）",
    summary:
      "営業提案スライドの完成見本。ダウンロードして実ファイルを確認できます。",
    usedAi: "MINERVOT（資料作成・PowerPoint）",
    typicalManualMinutes: 90,
  },
  {
    kind: "pdf",
    id: "pdf-proposal-outline",
    title: "PDF",
    formatLabel: "PDF",
    summary: "提案アウトラインの完成見本。実PDFとして確認できます。",
    usedAi: "MINERVOT（資料作成・PDF）",
    typicalManualMinutes: 40,
  },
];

export function formatProofDurationFromMs(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  if (safeMs < 1000) return `${safeMs}ミリ秒`;
  const sec = safeMs / 1000;
  if (sec < 60) {
    const rounded = Math.round(sec * 10) / 10;
    return `${rounded}秒`;
  }
  const totalSec = Math.round(sec);
  const m = Math.floor(totalSec / 60);
  const r = totalSec % 60;
  return r === 0 ? `${m}分` : `${m}分${r}秒`;
}

/** @deprecated prefer formatProofDurationFromMs */
export function formatProofDuration(sec: number): string {
  return formatProofDurationFromMs(sec * 1000);
}

export function formatProofSavedMinutes(savedMinutes: number): string {
  if (savedMinutes >= 60) {
    const hours = Math.round((savedMinutes / 60) * 10) / 10;
    return `約${hours}時間`;
  }
  const rounded = Math.round(savedMinutes * 10) / 10;
  return `約${rounded}分`;
}

export function computeSampleSavedMinutes(
  typicalManualMinutes: number,
  creationSec: number,
): number {
  return Math.max(0, Math.round((typicalManualMinutes - creationSec / 60) * 10) / 10);
}

export function creationSecFromMs(ms: number): number {
  return Math.max(0.1, Math.round((ms / 1000) * 10) / 10);
}

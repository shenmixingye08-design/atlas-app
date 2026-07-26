import type { QualityPromptKind, QualitySectionDef } from "./types";

const SALES_SECTIONS: readonly QualitySectionDef[] = [
  {
    id: "cover",
    title: "表紙",
    guidance: "最初の1ページで興味を引く。タイトル・対象・一言フック。",
  },
  {
    id: "company",
    title: "会社紹介",
    guidance: "Business Profileに沿った信頼できる紹介。",
  },
  {
    id: "problem",
    title: "課題",
    guidance: "読者の課題を具体化し共感を得る。",
  },
  {
    id: "proposal",
    title: "提案内容",
    guidance: "解決策を論理的に提示（課題→解決）。",
  },
  {
    id: "benefits",
    title: "メリット",
    guidance: "定量・定性の利点。図表を想定した箇条書き。",
  },
  {
    id: "pricing",
    title: "料金",
    guidance: "料金が不明なら「要確認」とし捏造しない。",
  },
  {
    id: "cta",
    title: "まとめ・CTA",
    guidance: "次のアクション（面談・見積依頼など）を明確に促す。",
  },
];

const BLOG_SECTIONS: readonly QualitySectionDef[] = [
  { id: "intro", title: "導入", guidance: "検索意図に答え、結論を予告。" },
  { id: "body", title: "本文", guidance: "SEOを意識した見出し付き展開。" },
  { id: "examples", title: "具体例", guidance: "実践しやすい例を1つ以上。" },
  { id: "summary", title: "まとめ", guidance: "要点と次の一歩。" },
];

const CONTRACT_SECTIONS: readonly QualitySectionDef[] = [
  { id: "parties", title: "当事者", guidance: "甲乙の定義。" },
  { id: "purpose", title: "目的", guidance: "契約の目的。" },
  { id: "terms", title: "条項", guidance: "主要条項を番号付きで漏れなく。" },
  { id: "liability", title: "責任・解除", guidance: "責任範囲と解除条件。" },
  { id: "closing", title: "署名欄", guidance: "日付・署名欄の体裁。" },
];

const ESTIMATE_SECTIONS: readonly QualitySectionDef[] = [
  { id: "header", title: "見積ヘッダ", guidance: "宛先・発行日・有効期限。" },
  { id: "items", title: "明細", guidance: "品目・数量・単価・金額。" },
  { id: "assumptions", title: "前提条件", guidance: "範囲外・条件を明記。" },
  { id: "totals", title: "合計", guidance: "小計・税・合計。" },
];

const INVOICE_SECTIONS: readonly QualitySectionDef[] = [
  { id: "header", title: "請求書ヘッダ", guidance: "発行者・宛先・日付・番号。" },
  { id: "items", title: "明細", guidance: "品目・数量・単価・金額。" },
  { id: "totals", title: "合計", guidance: "小計・税・合計。" },
  { id: "payment", title: "お支払条件", guidance: "振込先・期限。不明は要確認。" },
];

const REPORT_SECTIONS: readonly QualitySectionDef[] = [
  { id: "summary", title: "要約", guidance: "結論を先に。" },
  { id: "findings", title: "調査・分析", guidance: "根拠付きの発見。" },
  { id: "recommendations", title: "提言", guidance: "実行可能な提案。" },
  { id: "appendix", title: "補足", guidance: "前提・注意点。" },
];

const SNS_SECTIONS: readonly QualitySectionDef[] = [
  { id: "hooks", title: "投稿案", guidance: "3〜5本の投稿文。トーン統一。" },
  { id: "hashtags", title: "ハッシュタグ", guidance: "過剰にならない範囲で。" },
];

const EXCEL_SECTIONS: readonly QualitySectionDef[] = [
  { id: "schema", title: "列構成", guidance: "列名、型、色分け方針。" },
  { id: "rows", title: "データ行", guidance: "テーブル化できる行データ。" },
  { id: "formulas", title: "数式", guidance: "集計・計算式の例と前提。" },
  { id: "notes", title: "注記", guidance: "セル結合方針・注意。" },
];

const WORD_SECTIONS: readonly QualitySectionDef[] = [
  { id: "title", title: "タイトル", guidance: "文書タイトル。" },
  {
    id: "body",
    title: "本文",
    guidance: "見出し階層・箇条書き・表。改ページ推奨箇所を注記可。",
  },
  { id: "closing", title: "結語", guidance: "簡潔な締め。" },
];

const PDF_SECTIONS: readonly QualitySectionDef[] = [
  { id: "cover", title: "表紙", guidance: "タイトルと概要。印刷を意識。" },
  { id: "body", title: "本文", guidance: "読みやすいページ構成。" },
  { id: "closing", title: "まとめ", guidance: "要点整理。" },
];

const RECEIPT_SECTIONS: readonly QualitySectionDef[] = [
  { id: "scan", title: "読取結果", guidance: "Vision結果と矛盾しない事実のみ。" },
  { id: "ledger", title: "家計簿項目", guidance: "日付・店名・金額・科目。" },
  { id: "check", title: "確認メモ", guidance: "不明点は要確認。" },
];

const PLANNING_SECTIONS: readonly QualitySectionDef[] = [
  { id: "goal", title: "目的", guidance: "企画のゴール。" },
  { id: "target", title: "ターゲット", guidance: "誰に向けた企画か。" },
  { id: "actions", title: "施策", guidance: "優先順位付き施策。" },
  { id: "kpi", title: "KPI", guidance: "測定指標。" },
  { id: "schedule", title: "スケジュール", guidance: "体制と時期。" },
];

const MINUTES_SECTIONS: readonly QualitySectionDef[] = [
  { id: "meta", title: "会議情報", guidance: "日時・出席者。" },
  { id: "agenda", title: "議題", guidance: "議論した議題。" },
  { id: "decisions", title: "決定事項", guidance: "決まったことのみ。" },
  { id: "actions", title: "宿題", guidance: "担当・期限付きアクション。" },
];

const EMAIL_SECTIONS: readonly QualitySectionDef[] = [
  { id: "subject", title: "件名", guidance: "具体的で開封したくなる件名。" },
  { id: "body", title: "本文", guidance: "挨拶→用件→依頼→締め。簡潔に。" },
];

const GENERIC_SECTIONS: readonly QualitySectionDef[] = [
  { id: "overview", title: "概要", guidance: "目的と結論。" },
  { id: "body", title: "本文", guidance: "論理的な本論。" },
  { id: "next", title: "次のアクション", guidance: "読者が取るべき一歩。" },
];

const BY_KIND: Record<QualityPromptKind, readonly QualitySectionDef[]> = {
  sales_material: SALES_SECTIONS,
  proposal: [
    { id: "cover", title: "表紙", guidance: "提案タイトル。" },
    { id: "background", title: "背景", guidance: "現状と課題。" },
    { id: "solution", title: "提案", guidance: "具体案。" },
    { id: "plan", title: "実施計画", guidance: "スケジュールと体制。" },
    { id: "closing", title: "まとめ", guidance: "承認を促す締め。" },
  ],
  planning: PLANNING_SECTIONS,
  contract: CONTRACT_SECTIONS,
  estimate: ESTIMATE_SECTIONS,
  invoice: INVOICE_SECTIONS,
  report: REPORT_SECTIONS,
  blog: BLOG_SECTIONS,
  sns: SNS_SECTIONS,
  excel: EXCEL_SECTIONS,
  word: WORD_SECTIONS,
  pdf: PDF_SECTIONS,
  receipt: RECEIPT_SECTIONS,
  minutes: MINUTES_SECTIONS,
  email: EMAIL_SECTIONS,
  generic: GENERIC_SECTIONS,
};

export function getSectionsForKind(
  kind: QualityPromptKind,
): readonly QualitySectionDef[] {
  return BY_KIND[kind];
}

export function formatSectionsForPrompt(kind: QualityPromptKind): string {
  return getSectionsForKind(kind)
    .map((s, i) => `${i + 1}. [${s.id}] ${s.title} — ${s.guidance}`)
    .join("\n");
}

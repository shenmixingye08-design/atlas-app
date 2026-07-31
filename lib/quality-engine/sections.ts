import type { QualityPromptKind, QualitySectionDef } from "./types";

const SALES_SECTIONS: readonly QualitySectionDef[] = [
  { id: "cover", title: "表紙", guidance: "タイトル・対象・日付を簡潔に。" },
  { id: "company", title: "会社紹介", guidance: "Business Profileに沿った信頼できる紹介。" },
  { id: "problem", title: "課題", guidance: "読者の課題を具体化し共感を得る。" },
  { id: "proposal", title: "提案内容", guidance: "解決策を論理的に提示。" },
  { id: "benefits", title: "メリット", guidance: "定量・定性の利点を明確に。" },
  { id: "pricing", title: "料金", guidance: "料金が不明なら「要確認」とし捏造しない。" },
  { id: "closing", title: "まとめ", guidance: "次のアクションを促す締め。" },
];

const BLOG_SECTIONS: readonly QualitySectionDef[] = [
  { id: "intro", title: "導入", guidance: "読者の関心を引き、結論の予告。" },
  { id: "body", title: "本文", guidance: "見出し付きで論点を展開。" },
  { id: "examples", title: "具体例", guidance: "実践しやすい例を1つ以上。" },
  { id: "summary", title: "まとめ", guidance: "要点と次の一歩。" },
];

const CONTRACT_SECTIONS: readonly QualitySectionDef[] = [
  { id: "parties", title: "当事者", guidance: "甲乙の定義。" },
  { id: "purpose", title: "目的", guidance: "契約の目的。" },
  { id: "terms", title: "条項", guidance: "主要条項を番号付きで。" },
  { id: "liability", title: "責任・解除", guidance: "責任範囲と解除条件。" },
  { id: "closing", title: "署名欄", guidance: "日付・署名欄の体裁。" },
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
  { id: "schema", title: "列定義", guidance: "列名と意味。" },
  { id: "rows", title: "データ行", guidance: "表形式で具体データ。" },
  { id: "notes", title: "注記", guidance: "計算前提・注意。" },
];

const WORD_SECTIONS: readonly QualitySectionDef[] = [
  { id: "title", title: "タイトル", guidance: "文書タイトル。" },
  { id: "body", title: "本文", guidance: "見出し付き本文。" },
  { id: "closing", title: "結語", guidance: "簡潔な締め。" },
];

const PDF_SECTIONS: readonly QualitySectionDef[] = [
  { id: "cover", title: "表紙", guidance: "タイトルと概要。" },
  { id: "body", title: "本文", guidance: "読みやすいレイアウト構成。" },
  { id: "closing", title: "まとめ", guidance: "要点整理。" },
];

const RECEIPT_SECTIONS: readonly QualitySectionDef[] = [
  { id: "scan", title: "読取結果", guidance: "Vision結果と矛盾しない事実のみ。" },
  { id: "ledger", title: "家計簿項目", guidance: "日付・店名・金額・科目。" },
  { id: "check", title: "確認メモ", guidance: "不明点は要確認。" },
];

const GENERIC_SECTIONS: readonly QualitySectionDef[] = [
  { id: "overview", title: "概要", guidance: "目的と結論。" },
  { id: "body", title: "本文", guidance: "論理的な本論。" },
  { id: "next", title: "次のアクション", guidance: "読者が取るべき一歩。" },
];

const BY_KIND: Record<QualityPromptKind, readonly QualitySectionDef[]> = {
  sales_material: SALES_SECTIONS,
  contract: CONTRACT_SECTIONS,
  invoice: INVOICE_SECTIONS,
  report: REPORT_SECTIONS,
  proposal: [
    { id: "cover", title: "表紙", guidance: "提案タイトル。" },
    { id: "background", title: "背景", guidance: "現状と課題。" },
    { id: "solution", title: "提案", guidance: "具体案。" },
    { id: "plan", title: "実施計画", guidance: "スケジュールと体制。" },
    { id: "closing", title: "まとめ", guidance: "承認を促す締め。" },
  ],
  blog: BLOG_SECTIONS,
  sns: SNS_SECTIONS,
  excel: EXCEL_SECTIONS,
  word: WORD_SECTIONS,
  pdf: PDF_SECTIONS,
  receipt: RECEIPT_SECTIONS,
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

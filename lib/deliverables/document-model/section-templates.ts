import type { DocumentType } from "./types";

export type SectionSpec = {
  role: string;
  title: string;
  /** Heading synonyms used for matching existing content. */
  aliases: string[];
  /** Insert a page break before this section when content exists. */
  pageBreakBefore?: boolean;
  optional?: boolean;
};

const COMMON_SUMMARY: SectionSpec = {
  role: "summary",
  title: "概要",
  aliases: ["概要", "要約", "サマリー", "エグゼクティブサマリー", "まとめ"],
};

const COMMON_CONCLUSION: SectionSpec = {
  role: "conclusion",
  title: "結論",
  aliases: ["結論", "まとめ", "総括"],
  pageBreakBefore: true,
  optional: true,
};

const COMMON_ACTIONS: SectionSpec = {
  role: "actions",
  title: "次のアクション",
  aliases: ["次のアクション", "アクション", "今後の対応", "推奨事項", "次のステップ"],
  optional: true,
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  plan: "企画書",
  proposal: "提案書",
  report: "報告書",
  sales: "営業資料",
  estimate: "見積・比較資料",
  minutes: "議事録",
  manual: "手順書・マニュアル",
  research: "調査レポート",
  general: "一般文書",
};

export const SECTION_TEMPLATES: Record<DocumentType, SectionSpec[]> = {
  plan: [
    { role: "summary", title: "エグゼクティブサマリー", aliases: ["エグゼクティブサマリー", "概要", "要約", "サマリー"] },
    { role: "background", title: "背景", aliases: ["背景", "現状"] },
    { role: "issues", title: "課題", aliases: ["課題", "問題点"] },
    { role: "proposal", title: "提案内容", aliases: ["提案内容", "企画内容", "内容", "本文"] },
    { role: "benefits", title: "メリット", aliases: ["メリット", "効果", "期待効果"] },
    { role: "method", title: "実施方法", aliases: ["実施方法", "進め方", "方針"] },
    { role: "schedule", title: "スケジュール", aliases: ["スケジュール", "工程", "タイムライン"] },
    { role: "cost", title: "費用・必要リソース", aliases: ["費用", "コスト", "必要リソース", "予算"] },
    { role: "risks", title: "リスク", aliases: ["リスク", "懸念"] },
    { ...COMMON_ACTIONS, pageBreakBefore: true },
  ],
  proposal: [
    { role: "summary", title: "エグゼクティブサマリー", aliases: ["エグゼクティブサマリー", "概要", "要約", "サマリー"] },
    { role: "background", title: "背景", aliases: ["背景", "現状"] },
    { role: "issues", title: "課題", aliases: ["課題", "問題点", "ニーズ"] },
    { role: "proposal", title: "提案内容", aliases: ["提案内容", "ご提案", "ソリューション", "本文"] },
    { role: "benefits", title: "メリット", aliases: ["メリット", "効果", "価値"] },
    { role: "method", title: "実施方法", aliases: ["実施方法", "導入方法", "進め方"] },
    { role: "schedule", title: "スケジュール", aliases: ["スケジュール", "導入スケジュール"] },
    { role: "cost", title: "費用・必要リソース", aliases: ["費用", "お見積り", "価格", "必要リソース"] },
    { role: "risks", title: "リスク", aliases: ["リスク", "留意点"] },
    { ...COMMON_ACTIONS, pageBreakBefore: true },
  ],
  report: [
    { ...COMMON_SUMMARY, title: "要約" },
    { role: "purpose", title: "目的", aliases: ["目的", "調査目的", "報告目的"] },
    { role: "method", title: "方法", aliases: ["方法", "調査方法", "進め方"] },
    { role: "results", title: "結果", aliases: ["結果", "調査結果", "実績", "本文"] },
    { role: "analysis", title: "分析", aliases: ["分析", "考察"] },
    { ...COMMON_CONCLUSION },
    { role: "recommendations", title: "推奨事項", aliases: ["推奨事項", "提言", "次のアクション"], optional: true },
  ],
  sales: [
    { ...COMMON_SUMMARY },
    { role: "background", title: "背景・課題", aliases: ["背景", "課題", "ニーズ"] },
    { role: "offer", title: "ご提案内容", aliases: ["ご提案", "提案内容", "サービス内容", "本文"] },
    { role: "benefits", title: "導入メリット", aliases: ["メリット", "効果", "価値"] },
    { role: "comparison", title: "比較", aliases: ["比較", "他社比較", "プラン比較"], optional: true },
    { role: "pricing", title: "費用", aliases: ["費用", "価格", "お見積り"], optional: true },
    { ...COMMON_ACTIONS },
  ],
  estimate: [
    { ...COMMON_SUMMARY },
    { role: "scope", title: "対象範囲", aliases: ["対象", "範囲", "前提"] },
    { role: "comparison", title: "比較表", aliases: ["比較", "比較表", "プラン比較", "本文"] },
    { role: "pricing", title: "見積明細", aliases: ["見積", "明細", "費用", "価格"] },
    { role: "notes", title: "注記", aliases: ["注記", "注意事項", "前提条件"], optional: true },
    { ...COMMON_ACTIONS, optional: true },
  ],
  minutes: [
    { role: "meta", title: "会議情報", aliases: ["会議情報", "基本情報", "開催概要"] },
    { role: "agenda", title: "議題", aliases: ["議題", "アジェンダ", "議題一覧"] },
    { role: "decisions", title: "決定事項", aliases: ["決定事項", "決議", "決定"] },
    { role: "pending", title: "保留事項", aliases: ["保留事項", "未決", "持ち越し"], optional: true },
    { role: "actions", title: "アクション項目", aliases: ["アクション", "担当", "宿題", "ToDo", "次のアクション"] },
    { role: "next", title: "次回予定", aliases: ["次回", "次回予定", "次回会議"], optional: true },
    { role: "notes", title: "その他・補足", aliases: ["その他", "補足", "備考", "本文"], optional: true },
  ],
  manual: [
    { role: "purpose", title: "目的", aliases: ["目的"] },
    { role: "audience", title: "対象者", aliases: ["対象者", "対象"] },
    { role: "prep", title: "事前準備", aliases: ["事前準備", "準備", "前提条件"] },
    { role: "steps", title: "手順", aliases: ["手順", "ステップ", "操作手順", "本文"] },
    { role: "warnings", title: "注意事項", aliases: ["注意事項", "注意", "禁止事項"] },
    { role: "done", title: "完了条件", aliases: ["完了条件", "完了基準"], optional: true },
    { role: "troubleshoot", title: "トラブル対応", aliases: ["トラブル", "トラブル対応", "FAQ"], optional: true },
  ],
  research: [
    { ...COMMON_SUMMARY, title: "要約" },
    { role: "purpose", title: "調査目的", aliases: ["調査目的", "目的"] },
    { role: "method", title: "調査方法", aliases: ["調査方法", "方法", "手法"] },
    { role: "results", title: "結果", aliases: ["結果", "調査結果", "ファインディングス", "本文"] },
    { role: "analysis", title: "分析", aliases: ["分析"] },
    { role: "discussion", title: "考察", aliases: ["考察", "示唆"] },
    { ...COMMON_CONCLUSION },
    { role: "recommendations", title: "推奨事項", aliases: ["推奨事項", "提言", "次のアクション"], optional: true },
  ],
  general: [
    { ...COMMON_SUMMARY, optional: true },
    { role: "purpose", title: "目的", aliases: ["目的"], optional: true },
    { role: "background", title: "背景", aliases: ["背景"], optional: true },
    { role: "points", title: "要点", aliases: ["要点", "ポイント", "ポイント整理"], optional: true },
    { role: "body", title: "本文", aliases: ["本文", "内容", "詳細"] },
    { ...COMMON_CONCLUSION, optional: true },
    { ...COMMON_ACTIONS, optional: true },
  ],
};

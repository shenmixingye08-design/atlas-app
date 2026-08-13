/**
 * Presentation intent from assignment + section titles.
 * Deterministic — no extra LLM call.
 */

export type PresentationIntent =
  | "sales_proposal"
  | "internal_report"
  | "exec_report"
  | "research"
  | "product"
  | "company"
  | "howto"
  | "education"
  | "comparison"
  | "data_report"
  | "generic";

const RULES: Array<{ intent: PresentationIntent; pattern: RegExp }> = [
  { intent: "sales_proposal", pattern: /営業|提案|導入ご提案|pitch|proposal/i },
  { intent: "exec_report", pattern: /経営|取締役|役員|決算|取締役会/i },
  { intent: "internal_report", pattern: /社内報告|週次|月次報告|進捗報告|議事/i },
  { intent: "research", pattern: /調査|リサーチ|市場分析|research/i },
  { intent: "product", pattern: /商品説明|製品紹介|サービス紹介|機能紹介/i },
  { intent: "company", pattern: /会社紹介|企業概要|会社案内|about us/i },
  { intent: "howto", pattern: /手順|マニュアル|導入方法|オンボーディング|how to/i },
  { intent: "education", pattern: /研修|教育|講義|トレーニング|勉強会/i },
  { intent: "comparison", pattern: /比較|vs\.?|対比|選定/i },
  { intent: "data_report", pattern: /データ|数値報告|KPI|実績報告|ダッシュボード/i },
];

export function resolvePresentationIntent(input: {
  assignment?: string | null;
  title?: string | null;
  sectionTitles?: string[];
}): PresentationIntent {
  const hay = [input.assignment, input.title, ...(input.sectionTitles ?? [])]
    .filter(Boolean)
    .join("\n");
  for (const rule of RULES) {
    if (rule.pattern.test(hay)) return rule.intent;
  }
  return "generic";
}

/** Preferred section heading order for each intent. Unmatched sections keep source order after matches. */
export function preferredSectionOrder(intent: PresentationIntent): string[] {
  switch (intent) {
    case "sales_proposal":
      return ["課題", "現状", "解決", "提案", "メリット", "効果", "根拠", "導入", "費用", "次"];
    case "internal_report":
    case "exec_report":
      return ["結論", "要点", "数値", "KPI", "原因", "詳細", "課題", "次"];
    case "research":
      return ["目的", "方法", "結果", "考察", "提言"];
    case "product":
      return ["概要", "課題", "特長", "機能", "比較", "導入"];
    case "company":
      return ["概要", "事業", "実績", "強み", "体制"];
    case "howto":
      return ["目的", "準備", "手順", "注意", "次"];
    case "comparison":
      return ["比較", "現行", "提案", "結論"];
    case "data_report":
      return ["結論", "KPI", "推移", "内訳", "課題", "次"];
    default:
      return [];
  }
}

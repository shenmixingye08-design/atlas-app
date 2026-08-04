import type { WordPurpose, WordTemplateId } from "./registry";
import { getWordTemplate } from "./registry";

type PurposeRule = {
  purpose: WordPurpose;
  templateId: WordTemplateId;
  weight: number;
  patterns: RegExp[];
};

/**
 * Rule-based purpose detection — no AI.
 * Ambiguous matches fall back to standard-document; never fails Word generation.
 */
const PURPOSE_RULES: PurposeRule[] = [
  {
    purpose: "meeting_minutes",
    templateId: "meeting-minutes",
    weight: 6,
    patterns: [
      /議事録/,
      /会議の?(?:内容|結果)/,
      /ミーティングメモ/,
      /決定事項/,
      /参加者/,
      /議題/,
    ],
  },
  {
    purpose: "sales_report",
    templateId: "sales-report",
    weight: 6,
    patterns: [
      /営業報告/,
      /訪問内容を?営業/,
      /今日の訪問/,
      /訪問報告/,
      /営業日報/,
      /商談報告/,
    ],
  },
  {
    purpose: "comparison",
    templateId: "comparison-table",
    weight: 6,
    patterns: [
      /見積比較/,
      /価格を?比較/,
      /\d+社.*比較/,
      /比較した資料/,
      /プラン比較/,
      /料金比較/,
      /比較表/,
    ],
  },
  {
    purpose: "proposal",
    templateId: "proposal",
    weight: 5,
    patterns: [
      /提案書/,
      /ご提案/,
      /ソリューション提案/,
      /導入提案/,
      /太陽光発電.*提案/,
      /提案を?(?:Word|ワード)?で/,
    ],
  },
  {
    purpose: "manual",
    templateId: "manual",
    weight: 5,
    patterns: [
      /マニュアル/,
      /手順書/,
      /作業の流れ/,
      /作業手順/,
      /操作手順/,
      /手順にして/,
    ],
  },
  {
    purpose: "customer_letter",
    templateId: "customer-letter",
    weight: 5,
    patterns: [
      /案内文/,
      /地権者向け/,
      /お客様向け/,
      /顧客向け/,
      /お知らせ文/,
      /通知文/,
      /ご案内/,
    ],
  },
  {
    purpose: "business_report",
    templateId: "business-report",
    weight: 4,
    patterns: [
      /社内報告/,
      /業務報告/,
      /月次報告/,
      /週次報告/,
      /実績報告/,
      /報告書にして/,
    ],
  },
];

export type PurposeDetectionResult = {
  purpose: WordPurpose;
  templateId: WordTemplateId;
  confidence: "high" | "medium" | "low";
  matchedRule: string | null;
};

function score(text: string, rule: PurposeRule): number {
  let total = 0;
  for (const pattern of rule.patterns) {
    if (pattern.test(text)) total += rule.weight;
  }
  return total;
}

/**
 * Detect Word document purpose from the user request.
 * Never fails generation — unknown → standard-document.
 */
export function detectWordPurpose(input: {
  assignment: string;
  title?: string;
  content?: string;
  explicitTemplateId?: WordTemplateId | null;
}): PurposeDetectionResult {
  if (input.explicitTemplateId) {
    const template = getWordTemplate(input.explicitTemplateId);
    return {
      purpose: template.purposes[0] ?? "general",
      templateId: template.id,
      confidence: "high",
      matchedRule: "user_explicit_template",
    };
  }

  const haystack = [input.assignment, input.title, input.content]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n")
    .slice(0, 8_000);

  let best: { rule: PurposeRule; score: number } | null = null;
  for (const rule of PURPOSE_RULES) {
    const value = score(haystack, rule);
    if (value <= 0) continue;
    if (!best || value > best.score) {
      best = { rule, score: value };
    }
  }

  if (!best) {
    return {
      purpose: "general",
      templateId: "standard-document",
      confidence: "low",
      matchedRule: null,
    };
  }

  // Ambiguity guards — prefer specific over generic "報告書"
  if (
    best.rule.purpose === "business_report" &&
    /営業報告|訪問報告|商談報告/.test(haystack)
  ) {
    return {
      purpose: "sales_report",
      templateId: "sales-report",
      confidence: "high",
      matchedRule: "disambiguate_sales_vs_business",
    };
  }

  if (
    best.rule.purpose === "proposal" &&
    /営業資料|サービス紹介/.test(haystack) &&
    !/提案書/.test(haystack)
  ) {
    return {
      purpose: "sales_report",
      templateId: "sales-report",
      confidence: "medium",
      matchedRule: "disambiguate_sales_material",
    };
  }

  return {
    purpose: best.rule.purpose,
    templateId: best.rule.templateId,
    confidence: best.score >= 10 ? "high" : best.score >= 5 ? "medium" : "low",
    matchedRule: best.rule.purpose,
  };
}

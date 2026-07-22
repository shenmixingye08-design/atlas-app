import type { DocumentType } from "./types";

type Rule = {
  type: DocumentType;
  weight: number;
  patterns: RegExp[];
};

const RULES: Rule[] = [
  {
    type: "minutes",
    weight: 6,
    patterns: [
      /議事録/,
      /会議名/,
      /参加者/,
      /決定事項/,
      /アクション項目/,
      /議題/,
    ],
  },
  {
    type: "manual",
    weight: 5,
    patterns: [
      /マニュアル/,
      /手順書/,
      /操作手順/,
      /事前準備/,
      /トラブル対応/,
      /ステップ\s*\d+/,
    ],
  },
  {
    type: "estimate",
    weight: 5,
    patterns: [/見積/, /比較表/, /比較資料/, /料金表/, /プラン比較/, /見積明細/],
  },
  {
    type: "research",
    weight: 5,
    patterns: [/調査レポート/, /調査報告/, /調査目的/, /調査方法/, /ファインディング/],
  },
  {
    type: "report",
    weight: 4,
    patterns: [/報告書/, /報告資料/, /実績報告/, /結果報告/, /月次報告/, /週次報告/],
  },
  {
    type: "plan",
    weight: 4,
    patterns: [/企画書/, /事業計画/, /企画案/, /プロジェクト計画/, /実施計画/],
  },
  {
    type: "proposal",
    weight: 4,
    patterns: [/提案書/, /ご提案/, /提案資料/, /ソリューション提案/, /導入提案/],
  },
  {
    type: "sales",
    weight: 4,
    patterns: [/営業資料/, /営業提案/, /サービス紹介/, /提案資料/, /セールス/],
  },
];

function scoreText(text: string, rule: Rule): number {
  let score = 0;
  for (const pattern of rule.patterns) {
    if (pattern.test(text)) score += rule.weight;
  }
  return score;
}

/**
 * Detect document type from assignment + content without AI calls.
 * Prefers explicit Japanese document labels over generic keywords.
 */
export function detectDocumentType(input: {
  content: string;
  assignment?: string;
  title?: string;
}): DocumentType {
  const haystack = [input.assignment, input.title, input.content]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("\n")
    .slice(0, 12_000);

  let best: { type: DocumentType; score: number } = {
    type: "general",
    score: 0,
  };

  for (const rule of RULES) {
    const score = scoreText(haystack, rule);
    if (score > best.score) {
      best = { type: rule.type, score };
    }
  }

  // Disambiguate plan vs proposal when both match lightly.
  if (best.type === "sales" && /提案書|企画書/.test(haystack)) {
    if (/企画/.test(haystack) && !/営業/.test(haystack)) return "plan";
    if (/提案書/.test(haystack)) return "proposal";
  }

  return best.score > 0 ? best.type : "general";
}

import { detectCompanyDeliverableFormats } from "@/lib/company-templates/context";

import type {
  DeliverableFormat,
  DeliverableFormatDetection,
} from "./types";

type FormatRule = {
  id: string;
  keywords: readonly string[];
  formats: readonly DeliverableFormat[];
};

const FORMAT_RULES: readonly FormatRule[] = [
  {
    id: "sales-deck",
    keywords: [
      "営業資料",
      "sales deck",
      "pitch deck",
      "presentation deck",
      "プレゼン資料",
      "提案資料",
      "スライド",
    ],
    formats: ["pptx", "pdf"],
  },
  {
    id: "contract",
    keywords: [
      "契約書",
      "contract",
      " agreement",
      "nda",
      "秘密保持",
      "利用規約",
    ],
    formats: ["docx", "pdf"],
  },
  {
    id: "blog",
    keywords: ["ブログ", "blog post", "blog", "記事", "コラム"],
    formats: ["md", "docx"],
  },
  {
    id: "minutes",
    keywords: [
      "議事録",
      "meeting minutes",
      "minutes",
      "ミーティングメモ",
      "会議録",
    ],
    formats: ["docx", "pdf"],
  },
  {
    id: "comparison-table",
    keywords: ["比較表", "comparison", "見積比較", "一覧表"],
    formats: ["xlsx", "docx", "pdf"],
  },
  {
    id: "estimate",
    keywords: ["見積", "見積書", "estimate", "quotation"],
    formats: ["xlsx", "pdf", "docx"],
  },
  {
    id: "schedule",
    keywords: ["スケジュール", "日程表", "schedule", "工程表"],
    formats: ["xlsx", "pdf"],
  },
  {
    id: "report",
    keywords: ["報告書", "レポート", "report", "whitepaper", "白書"],
    formats: ["pdf", "docx"],
  },
  {
    id: "readme",
    keywords: ["readme", "documentation", "ドキュメント", "仕様書"],
    formats: ["md", "txt", "pdf"],
  },
] as const;

const DEFAULT_FORMATS: readonly DeliverableFormat[] = ["md", "txt", "pdf"];

function normalizeHaystack(value: string): string {
  return value.toLowerCase();
}

/** Infer which file formats to produce from the user's assignment text. */
export function detectDeliverableFormats(
  assignment: string,
): DeliverableFormatDetection {
  const companyDetection = detectCompanyDeliverableFormats(assignment);

  if (companyDetection.matchedRule && !companyDetection.matchedRule.endsWith(":default")) {
    return companyDetection;
  }

  const haystack = normalizeHaystack(assignment);

  for (const rule of FORMAT_RULES) {
    const matched = rule.keywords.some((keyword) =>
      haystack.includes(keyword.toLowerCase()),
    );

    if (matched) {
      return {
        formats: [...rule.formats],
        matchedRule: rule.id,
      };
    }
  }

  if (companyDetection.formats.length > 0) {
    return companyDetection;
  }

  return {
    formats: [...DEFAULT_FORMATS],
    matchedRule: null,
  };
}

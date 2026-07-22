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
      "パワーポイント",
      "powerpoint",
    ],
    formats: ["pptx", "pdf", "docx"],
  },
  {
    id: "spreadsheet",
    keywords: [
      "エクセル",
      "excel",
      "スプレッドシート",
      "売上管理",
      "営業管理",
      "予算表",
      "実績表",
      "一覧表",
      "管理表",
      "CSV",
      "集計表",
      "数値表",
    ],
    formats: ["xlsx", "csv", "pdf"],
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
    formats: ["md", "docx", "pdf"],
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
    formats: ["docx", "pdf", "md"],
  },
  {
    id: "report",
    keywords: ["報告書", "レポート", "report", "whitepaper", "白書", "企画書"],
    formats: ["docx", "pdf", "pptx"],
  },
  {
    id: "readme",
    keywords: ["readme", "documentation", "ドキュメント", "仕様書"],
    formats: ["md", "txt", "pdf", "docx"],
  },
] as const;

/** Business default: Word + PDF + Markdown + Text for general work handoff. */
const DEFAULT_FORMATS: readonly DeliverableFormat[] = [
  "docx",
  "pdf",
  "md",
  "txt",
];

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

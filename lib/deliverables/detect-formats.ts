import { detectCompanyDeliverableFormats } from "@/lib/company-templates/context";

import { isExcelIntent } from "./excel-intent";
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

const DEFAULT_FORMATS: readonly DeliverableFormat[] = [
  "md",
  "txt",
  "pdf",
  "docx",
  "xlsx",
];

const EXCEL_FLOW_FORMATS: readonly DeliverableFormat[] = [
  "xlsx",
  "pdf",
  "docx",
  "md",
];

function normalizeHaystack(value: string): string {
  return value.toLowerCase();
}

function withXlsx(formats: readonly DeliverableFormat[]): DeliverableFormat[] {
  if (formats.includes("xlsx")) return [...formats];
  return [...formats, "xlsx"];
}

/** Infer which file formats to produce from the user's assignment text. */
export function detectDeliverableFormats(
  assignment: string,
): DeliverableFormatDetection {
  if (isExcelIntent(assignment)) {
    return {
      formats: [...EXCEL_FLOW_FORMATS],
      matchedRule: "excel-spreadsheet",
    };
  }

  const companyDetection = detectCompanyDeliverableFormats(assignment);

  if (companyDetection.matchedRule && !companyDetection.matchedRule.endsWith(":default")) {
    return {
      formats: withXlsx(companyDetection.formats),
      matchedRule: companyDetection.matchedRule,
    };
  }

  const haystack = normalizeHaystack(assignment);

  for (const rule of FORMAT_RULES) {
    const matched = rule.keywords.some((keyword) =>
      haystack.includes(keyword.toLowerCase()),
    );

    if (matched) {
      return {
        formats: withXlsx(rule.formats),
        matchedRule: rule.id,
      };
    }
  }

  if (companyDetection.formats.length > 0) {
    return {
      formats: withXlsx(companyDetection.formats),
      matchedRule: companyDetection.matchedRule,
    };
  }

  return {
    formats: [...DEFAULT_FORMATS],
    matchedRule: null,
  };
}

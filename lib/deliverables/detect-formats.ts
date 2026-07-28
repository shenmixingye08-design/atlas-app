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
    id: "word-document",
    keywords: [
      "word",
      "ワード",
      "docx",
      ".docx",
      "wordファイル",
      "ワードファイル",
      "wordで",
      "ワードで",
      "word作成",
      "ワード作成",
      "wordにして",
      "ワードにして",
      "文書作成",
      "書類作成",
    ],
    formats: ["docx", "pdf"],
  },
  {
    id: "excel",
    keywords: [
      "excel",
      "xlsx",
      "エクセル",
      "表計算",
      "スプレッドシート",
      "spreadsheet",
      "一覧表",
      "家計簿",
      "レシート",
      "領収書",
      "請求書",
      "経費精算",
      "表にまと",
      "表形式",
      "excelにして",
      "エクセルにして",
    ],
    formats: ["xlsx", "pdf", "docx"],
  },
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

const DEFAULT_FORMATS: readonly DeliverableFormat[] = ["md", "txt", "pdf"];

function normalizeHaystack(value: string): string {
  return value.toLowerCase();
}

/** True when the assignment / preferred format should produce a Word (.docx) file. */
export function assignmentRequestsWordFile(
  assignment: string,
  metadata?: Readonly<Record<string, unknown>> | null,
): boolean {
  const preferred = metadata?.preferredDeliverableFormat;
  if (typeof preferred === "string") {
    const normalized = preferred.trim().toLowerCase();
    if (normalized === "docx" || normalized === "word" || normalized === "doc") {
      return true;
    }
    if (
      normalized === "pdf" ||
      normalized === "xlsx" ||
      normalized === "pptx" ||
      normalized === "md" ||
      normalized === "txt"
    ) {
      return false;
    }
  }
  return detectDeliverableFormats(assignment).formats.includes("docx");
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

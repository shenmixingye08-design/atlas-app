import type { ImageDocumentType } from "./types";

export type ImageDocumentIntent = {
  documentType: ImageDocumentType;
  /** True when the request requires reading image pixels (not inventing). */
  requiresImageContent: boolean;
  /** Prefer Excel / CSV exports. */
  prefersSpreadsheet: boolean;
  /** Prefer Word / Markdown / PDF (e.g. handwritten notes). */
  prefersDocument: boolean;
  matchedRule: string | null;
};

type IntentRule = {
  id: string;
  documentType: ImageDocumentType;
  keywords: readonly string[];
  prefersSpreadsheet?: boolean;
  prefersDocument?: boolean;
};

const INTENT_RULES: readonly IntentRule[] = [
  {
    id: "receipt",
    documentType: "receipt",
    keywords: [
      "レシート",
      "領収書",
      "receipt",
      "家計簿",
      "支出を記録",
      "経費精算",
    ],
    prefersSpreadsheet: true,
  },
  {
    id: "invoice",
    documentType: "invoice",
    keywords: [
      "請求書",
      "invoice",
      "請求を",
      "帳票を読み取",
      "金額を表に",
    ],
    prefersSpreadsheet: true,
  },
  {
    id: "estimate",
    documentType: "estimate",
    keywords: ["見積書", "見積", "estimate", "quotation"],
    prefersSpreadsheet: true,
  },
  {
    id: "business_card",
    documentType: "business_card",
    keywords: [
      "名刺",
      "連絡先",
      "business card",
      "名刺を登録",
      "名刺を一覧",
      "名刺をデータ",
    ],
    prefersSpreadsheet: true,
  },
  {
    id: "handwritten",
    documentType: "handwritten",
    keywords: [
      "手書き",
      "ホワイトボード",
      "メモを文字",
      "文字起こし",
      "todoにして",
      "to doにして",
      "ToDoにして",
      "議事録にして",
    ],
    prefersDocument: true,
  },
  {
    id: "table",
    documentType: "table",
    keywords: [
      "excel",
      "xlsx",
      "エクセル",
      "スプレッドシート",
      "表にして",
      "表形式",
      "一覧をexcel",
      "一覧をエクセル",
      "一覧にして",
      "ランキング",
      "ocrしてexcel",
      "ocrしてエクセル",
      "写真をexcel",
      "写真をエクセル",
      "画像を表",
      "画像からexcel",
      "画像からエクセル",
      "この写真からexcel",
      "この写真からエクセル",
      "この写真をexcel",
      "この写真をエクセル",
    ],
    prefersSpreadsheet: true,
  },
] as const;

const ATTACHMENT_HINT =
  /添付|画像|写真|スクショ|スクリーンショット|image|photo|screenshot/i;

function normalize(value: string): string {
  return value.toLowerCase();
}

/** Detect structured image-document intent from the assignment text (no AI). */
export function detectImageDocumentIntent(
  assignment: string,
): ImageDocumentIntent {
  const haystack = normalize(assignment);

  for (const rule of INTENT_RULES) {
    const matched = rule.keywords.some((keyword) =>
      haystack.includes(keyword.toLowerCase()),
    );
    if (!matched) continue;

    return {
      documentType: rule.documentType,
      requiresImageContent: true,
      prefersSpreadsheet: rule.prefersSpreadsheet === true,
      prefersDocument: rule.prefersDocument === true,
      matchedRule: rule.id,
    };
  }

  if (ATTACHMENT_HINT.test(assignment)) {
    return {
      documentType: "unknown",
      requiresImageContent: true,
      prefersSpreadsheet: false,
      prefersDocument: false,
      matchedRule: "attachment_hint",
    };
  }

  return {
    documentType: "unknown",
    requiresImageContent: false,
    prefersSpreadsheet: false,
    prefersDocument: false,
    matchedRule: null,
  };
}

/** True when Excel should be auto-generated at completion. */
export function assignmentRequestsSpreadsheet(assignment: string): boolean {
  const haystack = normalize(assignment);
  const keywords = [
    "excel",
    "xlsx",
    "エクセル",
    "表",
    "一覧",
    "集計",
    "家計簿",
    "請求書",
    "見積書",
    "spreadsheet",
    "スプレッドシート",
  ];
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

export function isStructuredImageDocumentIntent(
  intent: ImageDocumentIntent,
): boolean {
  return (
    intent.requiresImageContent &&
    intent.documentType !== "unknown" &&
    Boolean(intent.matchedRule)
  );
}

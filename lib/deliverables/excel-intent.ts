/**
 * Excel (.xlsx) intent detection and filename hints.
 * Pure string rules — no AI. Used by format detection and UI auto-download.
 */

export type ExcelFilenameHint = {
  keywords: readonly string[];
  baseName: string;
};

/** Keyword → preferred download base name (without extension). */
export const EXCEL_FILENAME_HINTS: readonly ExcelFilenameHint[] = [
  { keywords: ["ranking", "ランキング", "順位"], baseName: "ranking" },
  { keywords: ["invoice", "請求", "領収", "請求書"], baseName: "invoice" },
  { keywords: ["ocr", "OCR", "読み取"], baseName: "ocr_result" },
  {
    keywords: ["product", "products", "商品", "製品", "品目"],
    baseName: "products",
  },
  {
    keywords: ["inventory", "在庫", "棚卸"],
    baseName: "inventory",
  },
  {
    keywords: ["sales", "売上", "販売"],
    baseName: "sales",
  },
  {
    keywords: ["customer", "顧客", "お客様一覧"],
    baseName: "customers",
  },
  {
    keywords: ["schedule", "予定", "スケジュール"],
    baseName: "schedule",
  },
] as const;

/** Assignment phrases that should switch into the Excel generation flow. */
export const EXCEL_INTENT_KEYWORDS: readonly string[] = [
  "excel",
  "xlsx",
  "エクセル",
  "スプレッドシート",
  "spreadsheet",
  "表にして",
  "表形式",
  "一覧をexcel",
  "一覧をエクセル",
  "一覧をxlsx",
  "一覧にして",
  "ランキングをexcel",
  "ランキングをエクセル",
  "excel化",
  "エクセル化",
  "excel作って",
  "エクセル作って",
  "excelにして",
  "エクセルにして",
  "ocrしてexcel",
  "ocrしてエクセル",
  "写真からexcel",
  "写真からエクセル",
  "写真からスプレッドシート",
  "画像を表",
  "画像からexcel",
  "画像からエクセル",
  "画像から表",
  "この写真からexcel",
  "この写真からエクセル",
] as const;

function normalizeHaystack(value: string): string {
  return value.toLowerCase();
}

/** True when the user asked for Excel / spreadsheet / table export. */
export function isExcelIntent(assignment: string): boolean {
  const haystack = normalizeHaystack(assignment);
  return EXCEL_INTENT_KEYWORDS.some((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  );
}

/** Build a timestamp fallback like `20260722_1554_result`. */
export function buildTimestampExcelBaseName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}${mm}${dd}_${hh}${mi}_result`;
}

/**
 * Prefer intent-based English names (ranking / invoice / …),
 * then a safe title, then a timestamp fallback.
 */
export function buildExcelBaseName(
  assignment: string,
  title?: string,
): string {
  const haystack = normalizeHaystack(`${assignment}\n${title ?? ""}`);

  for (const hint of EXCEL_FILENAME_HINTS) {
    if (hint.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return hint.baseName;
    }
  }

  const source = (title ?? assignment).trim().split("\n")[0]?.trim() ?? "";
  const safe = source
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 48);

  if (safe.length >= 1) {
    return safe;
  }

  return buildTimestampExcelBaseName();
}

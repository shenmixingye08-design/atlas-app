import type { VisionDetectedType } from "@/lib/vision/types";

/**
 * Route natural-language household requests without treating
 * generic table→Excel photos as 家計簿.
 */

const HOUSEHOLD_LANGUAGE =
  /家計簿|今月の支出|支出に追加|この買い物まとめて|買い物まとめて|今日のレシート整理|レシート整理|レシートを?Excel|レシートを?エクセル|レシート家計簿|家計簿作って/i;

const TABLE_EXCEL_LANGUAGE =
  /この表を|表を?Excel|表を?エクセル|表画像|スプレッドシート|行列を?Excel/i;

const APPEND_LANGUAGE = /追加して|今月の支出|支出に追加/;

const EXPLAIN_LANGUAGE = /内容を説明|何が書いて|説明して/;

export function isHouseholdLanguage(assignment: string): boolean {
  return HOUSEHOLD_LANGUAGE.test(assignment);
}

export function isTableSpreadsheetRequest(assignment: string): boolean {
  return TABLE_EXCEL_LANGUAGE.test(assignment) && !/レシート|領収書/.test(assignment);
}

export function isHouseholdAppendRequest(assignment: string): boolean {
  return APPEND_LANGUAGE.test(assignment) && !isTableSpreadsheetRequest(assignment);
}

export function isHouseholdExplainOnly(assignment: string): boolean {
  return (
    EXPLAIN_LANGUAGE.test(assignment) &&
    !/Excel|エクセル|家計簿|表にして/i.test(assignment)
  );
}

/**
 * True when the user asked for a household book, or a receipt image
 * should become a household book (not a generic table dump).
 */
export function isHouseholdBookRequest(
  assignment: string,
  detectedType?: VisionDetectedType | null,
): boolean {
  const text = assignment.trim();
  if (isHouseholdExplainOnly(text)) return false;
  if (isTableSpreadsheetRequest(text) && detectedType !== "receipt") {
    return false;
  }
  if (
    detectedType === "table" ||
    detectedType === "spreadsheet_source"
  ) {
    return /レシート|領収書/.test(text);
  }
  if (isHouseholdLanguage(text)) return true;
  if (detectedType === "receipt") return true;
  return false;
}

export function recommendHouseholdArtifactType(
  detectedType: VisionDetectedType,
  assignment: string,
): "household_excel" | "table_excel" | null {
  if (isHouseholdExplainOnly(assignment) && detectedType === "receipt") {
    return null;
  }
  if (detectedType === "receipt") return "household_excel";
  if (
    isHouseholdLanguage(assignment) &&
    detectedType !== "table" &&
    detectedType !== "spreadsheet_source" &&
    detectedType !== "invoice" &&
    detectedType !== "estimate"
  ) {
    if (detectedType === "unknown") return "household_excel";
    return null;
  }
  if (
    detectedType === "table" ||
    detectedType === "spreadsheet_source"
  ) {
    return "table_excel";
  }
  return null;
}

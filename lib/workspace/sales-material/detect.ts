const SALES_MATERIAL_KEYWORDS = [
  "営業資料",
  "sales deck",
  "pitch deck",
  "presentation deck",
  "プレゼン資料",
  "提案資料",
  "スライド資料",
  "スライドを",
  "スライド作成",
] as const;

/** True when the assignment is a sales / pitch deck request. */
export function isSalesMaterialRequest(assignment: string): boolean {
  const haystack = assignment.toLowerCase();
  return SALES_MATERIAL_KEYWORDS.some((keyword) =>
    haystack.includes(keyword.toLowerCase()),
  );
}

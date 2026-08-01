/** Production limits for Excel Secretary — prevent Vercel/memory blowups. */

export const EXCEL_LIMITS = {
  maxUploadBytes: 15 * 1024 * 1024,
  maxSheets: 30,
  maxRowsPerSheet: 50_000,
  maxColumns: 64,
  maxPreviewRows: 100,
  streamingRowThreshold: 50_000,
  backgroundRowThreshold: 20_000,
  maxGenerationMs: 120_000,
  maxFileNameLength: 80,
} as const;

export type ExcelScaleTier = "small" | "medium" | "large" | "xlarge";

export function classifyExcelScale(rowCount: number, byteLength?: number): ExcelScaleTier {
  if (
    rowCount >= EXCEL_LIMITS.backgroundRowThreshold ||
    (byteLength != null && byteLength >= 8 * 1024 * 1024)
  ) {
    return rowCount >= EXCEL_LIMITS.maxRowsPerSheet ? "xlarge" : "large";
  }
  if (rowCount >= 5_000) return "medium";
  return "small";
}

export function excelScaleGuidance(tier: ExcelScaleTier): string {
  switch (tier) {
    case "small":
      return "通常処理で生成します。";
    case "medium":
      return "中規模のためストリーミング寄りで処理します。";
    case "large":
      return "大規模のためバックグラウンド処理を推奨します。プレビューは先頭行のみです。";
    case "xlarge":
      return `行数が上限（${EXCEL_LIMITS.maxRowsPerSheet.toLocaleString("ja-JP")}）に近いため、分割またはサンプリングが必要です。`;
  }
}

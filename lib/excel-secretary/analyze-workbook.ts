import type { ExcelAnalysisResult, ExcelWorkbookModel } from "./types";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[,¥￥円\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Rule-based Excel analysis (no AI). AI comments can be layered by caller.
 */
export function analyzeWorkbookModel(
  model: ExcelWorkbookModel,
): ExcelAnalysisResult {
  const rankings: ExcelAnalysisResult["rankings"] = [];
  const anomalies: ExcelAnalysisResult["anomalies"] = [];
  const comments: string[] = [];

  for (const sheet of model.sheets) {
    const amountCol = sheet.columns.findIndex(
      (c) => c.kind === "currency" || /amount|金額|売上/i.test(c.key + c.header),
    );
    const labelCol = sheet.columns.findIndex((c) => c.kind === "text");
    if (amountCol < 0) continue;

    const pairs: Array<{ label: string; value: number; row: number }> = [];
    for (let i = 0; i < sheet.rows.length; i += 1) {
      const row = sheet.rows[i]!;
      if (row[0]?.value === "合計") continue;
      const value = toNumber(row[amountCol]?.value);
      if (value == null) continue;
      const label = String(row[labelCol >= 0 ? labelCol : 0]?.value ?? `${i + 1}`);
      pairs.push({ label, value, row: i + 1 });
    }

    if (pairs.length === 0) continue;

    const sorted = [...pairs].sort((a, b) => b.value - a.value);
    for (const item of sorted.slice(0, 5)) {
      rankings.push({ label: `${sheet.name}:${item.label}`, value: item.value });
    }

    const mean =
      pairs.reduce((sum, p) => sum + p.value, 0) / Math.max(pairs.length, 1);
    const variance =
      pairs.reduce((sum, p) => sum + (p.value - mean) ** 2, 0) /
      Math.max(pairs.length, 1);
    const std = Math.sqrt(variance) || 1;
    for (const item of pairs) {
      if (Math.abs(item.value - mean) > std * 2.5) {
        anomalies.push({
          sheet: sheet.name,
          row: item.row,
          message: `「${item.label}」が平均から大きく乖離（${item.value} / 平均${Math.round(mean)}）`,
        });
      }
    }

    comments.push(
      `${sheet.name}: ${pairs.length}件、合計${Math.round(pairs.reduce((s, p) => s + p.value, 0)).toLocaleString("ja-JP")}、最大は「${sorted[0]?.label}」。`,
    );
  }

  // Year-over-year heuristic: look for year columns or date years in labels.
  const yearBuckets = new Map<number, number>();
  for (const sheet of model.sheets) {
    const dateCol = sheet.columns.findIndex((c) => c.kind === "date");
    const amountCol = sheet.columns.findIndex((c) => c.kind === "currency");
    if (dateCol < 0 || amountCol < 0) continue;
    for (const row of sheet.rows) {
      const dateVal = row[dateCol]?.value;
      const amount = toNumber(row[amountCol]?.value);
      if (amount == null) continue;
      let year: number | null = null;
      if (dateVal instanceof Date) year = dateVal.getFullYear();
      else if (typeof dateVal === "string") {
        const m = /(\d{4})/.exec(dateVal);
        if (m) year = Number(m[1]);
      }
      if (year == null) continue;
      yearBuckets.set(year, (yearBuckets.get(year) ?? 0) + amount);
    }
  }

  let yearOverYear: ExcelAnalysisResult["yearOverYear"] = null;
  const years = [...yearBuckets.keys()].sort();
  if (years.length >= 2) {
    const prev = years[years.length - 2]!;
    const curr = years[years.length - 1]!;
    const previous = yearBuckets.get(prev) ?? 0;
    const current = yearBuckets.get(curr) ?? 0;
    const deltaPct = previous === 0 ? 100 : ((current - previous) / previous) * 100;
    yearOverYear = [
      {
        label: `${prev}→${curr}`,
        current,
        previous,
        deltaPct: Math.round(deltaPct * 10) / 10,
      },
    ];
    comments.push(
      `前年比較: ${prev}年 ${Math.round(previous).toLocaleString("ja-JP")} → ${curr}年 ${Math.round(current).toLocaleString("ja-JP")}（${deltaPct >= 0 ? "+" : ""}${Math.round(deltaPct)}%）`,
    );
  }

  if (anomalies.length === 0) {
    comments.push("明確な異常値は検出されませんでした。");
  }

  const summary =
    comments[0] ??
    `${model.title} を分析しました（シート${model.sheets.length}）。`;

  return {
    summary,
    rankings,
    anomalies,
    yearOverYear,
    comments,
  };
}

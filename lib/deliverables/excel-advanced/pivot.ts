/**
 * Deterministic category×value pivot aggregation for Excel deliverables (P3-03).
 * No AI — pure aggregation so restart / multi-instance results match.
 */

export const PIVOT_SHEET_NAME = "ピボット集計";

export type PivotSourceSheet = {
  name: string;
  headers: string[];
  /** Row values already typed where possible (string | number | Date). */
  rows: Array<Array<string | number | Date | null | undefined>>;
};

export type PivotAggregateRow = {
  category: string;
  total: number;
};

export type PivotPlan = {
  sourceSheetName: string;
  categoryHeader: string;
  valueHeader: string;
  categoryCol: number;
  valueCol: number;
  rows: PivotAggregateRow[];
};

function headerSuggestsCurrency(header: string): boolean {
  return /金額|価格|売上|単価|料金|費用|amount|price|cost|revenue|円|currency|合計|総額/i.test(
    header,
  );
}

function headerSuggestsNumber(header: string): boolean {
  return /数量|個数|件数|qty|quantity|count|人数|率|%|合計|総額/i.test(header);
}

function asNumber(value: string | number | Date | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[,，\s¥￥円$€]/g, "").replace(/%$/, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function asCategory(value: string | number | Date | null | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

/** Pick category (text) + value (numeric) columns from a sheet. */
export function resolvePivotColumns(
  headers: string[],
  rows: Array<Array<string | number | Date | null | undefined>>,
): { categoryCol: number; valueCol: number } | null {
  if (headers.length < 2 || rows.length < 1) return null;

  let valueCol = headers.findIndex((h) => headerSuggestsCurrency(h));
  if (valueCol < 0) {
    valueCol = headers.findIndex((h) => headerSuggestsNumber(h));
  }
  if (valueCol < 0) {
    // First column with majority numeric samples.
    for (let col = 0; col < headers.length; col += 1) {
      const samples = rows.map((row) => asNumber(row[col]));
      const numeric = samples.filter((n) => n != null).length;
      if (numeric >= Math.max(1, Math.ceil(rows.length * 0.5))) {
        valueCol = col;
        break;
      }
    }
  }
  if (valueCol < 0) return null;

  let categoryCol = headers.findIndex(
    (_h, idx) =>
      idx !== valueCol &&
      rows.some((row) => asCategory(row[idx]).length > 0) &&
      rows.filter((row) => asNumber(row[idx]) == null).length >=
        Math.ceil(rows.length * 0.5),
  );
  if (categoryCol < 0) {
    categoryCol = headers.findIndex((_h, idx) => idx !== valueCol);
  }
  if (categoryCol < 0 || categoryCol === valueCol) return null;
  return { categoryCol, valueCol };
}

/** Aggregate SUM(value) GROUP BY category — stable sort by category. */
export function buildPivotAggregate(
  headers: string[],
  rows: Array<Array<string | number | Date | null | undefined>>,
): Omit<PivotPlan, "sourceSheetName"> | null {
  const cols = resolvePivotColumns(headers, rows);
  if (!cols) return null;

  const totals = new Map<string, number>();
  for (const row of rows) {
    const category = asCategory(row[cols.categoryCol]);
    const value = asNumber(row[cols.valueCol]);
    if (!category || value == null) continue;
    totals.set(category, (totals.get(category) ?? 0) + value);
  }
  if (totals.size < 1) return null;

  const aggregateRows = [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => a.category.localeCompare(b.category, "ja"));

  return {
    categoryHeader: headers[cols.categoryCol] || "カテゴリ",
    valueHeader: headers[cols.valueCol] || "合計",
    categoryCol: cols.categoryCol,
    valueCol: cols.valueCol,
    rows: aggregateRows,
  };
}

/**
 * Choose the best source sheet for pivot (most aggregatable rows).
 */
export function planPivotFromSheets(
  sheets: PivotSourceSheet[],
): PivotPlan | null {
  let best: PivotPlan | null = null;
  for (const sheet of sheets) {
    // Never re-pivot an existing pivot sheet.
    if (sheet.name === PIVOT_SHEET_NAME) continue;
    const built = buildPivotAggregate(sheet.headers, sheet.rows);
    if (!built) continue;
    const candidate: PivotPlan = {
      sourceSheetName: sheet.name,
      ...built,
    };
    if (!best || candidate.rows.length > best.rows.length) {
      best = candidate;
    }
  }
  return best;
}

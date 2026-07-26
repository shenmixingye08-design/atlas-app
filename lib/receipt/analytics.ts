import type { LedgerEntry, MonthlyAnalytics, ReceiptCategory } from "./types";
import { RECEIPT_CATEGORIES } from "./types";
import { buildReceiptSuggestions } from "./suggestions";

function yearMonthOf(date: string): string {
  return date.slice(0, 7);
}

function shiftMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m! - 1) + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildComment(input: {
  yearMonth: string;
  total: number;
  previous: number | null;
  byCategory: MonthlyAnalytics["byCategory"];
}): string {
  if (input.previous == null) {
    return `${input.yearMonth} の支出は ${input.total.toLocaleString("ja-JP")} 円です。来月からの比較ができるようになります。`;
  }
  const delta = input.total - input.previous;
  const pct =
    input.previous === 0 ? null : Math.round((delta / input.previous) * 100);
  const top = input.byCategory[0];
  if (pct != null && pct >= 10 && top) {
    return `今月は総支出が${pct}%増加しています。特に「${top.category}」の割合が高めです。`;
  }
  if (pct != null && pct <= -10) {
    return `今月は総支出が${Math.abs(pct)}%減少しています。節約の成果が出ています。`;
  }
  if (top && top.share >= 0.4) {
    return `「${top.category}」が支出の${Math.round(top.share * 100)}%を占めています。見直し候補です。`;
  }
  return `今月の支出は ${input.total.toLocaleString("ja-JP")} 円で、先月と大きく変わっていません。`;
}

export function buildMonthlyAnalytics(
  entries: LedgerEntry[],
  yearMonth: string,
): MonthlyAnalytics {
  const monthEntries = entries.filter(
    (entry) => yearMonthOf(entry.date) === yearMonth,
  );
  const previousMonth = shiftMonth(yearMonth, -1);
  const previousEntries = entries.filter(
    (entry) => yearMonthOf(entry.date) === previousMonth,
  );

  const totalSpend = monthEntries.reduce((sum, e) => sum + e.amountInclTax, 0);
  const previousTotal = previousEntries.reduce(
    (sum, e) => sum + e.amountInclTax,
    0,
  );

  const byCategory = RECEIPT_CATEGORIES.map((category) => {
    const amount = monthEntries
      .filter((entry) => entry.category === category)
      .reduce((sum, e) => sum + e.amountInclTax, 0);
    return {
      category: category as ReceiptCategory,
      amount,
      share: totalSpend > 0 ? amount / totalSpend : 0,
    };
  })
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const deltaAmount =
    previousEntries.length > 0 ? totalSpend - previousTotal : null;
  const deltaPercent =
    previousTotal > 0 && deltaAmount != null
      ? Math.round((deltaAmount / previousTotal) * 100)
      : previousTotal === 0 && totalSpend > 0
        ? 100
        : null;

  const aiComment = buildComment({
    yearMonth,
    total: totalSpend,
    previous: previousEntries.length > 0 ? previousTotal : null,
    byCategory,
  });

  const suggestions = buildReceiptSuggestions({
    schemas: [],
    entries,
    newEntries: monthEntries,
  });

  return {
    yearMonth,
    totalSpend,
    byCategory,
    previousTotal: previousEntries.length > 0 ? previousTotal : null,
    deltaAmount,
    deltaPercent,
    aiComment,
    suggestions,
  };
}

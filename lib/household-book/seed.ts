/**
 * Household book → existing Excel SoT seed.
 * Markdown tables for humans + JSON sheets with declared types for xlsx-generator.
 * No household-only Excel generator.
 */

import {
  DEFAULT_HOUSEHOLD_COLUMNS,
  DEFAULT_HOUSEHOLD_PREFERENCES,
  type HouseholdBookDocument,
  type HouseholdColumn,
  type HouseholdLine,
  type HouseholdPreferences,
} from "@/lib/household-book/types";

function cellText(value: string | null | undefined): string {
  return value?.trim() ? value.replace(/\|/g, "／") : "";
}

function cellNumber(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function lineMemo(line: HouseholdLine): string {
  const parts = [
    line.memo,
    ...line.warnings.map((warning) => warning.message),
  ].filter((part): part is string => Boolean(part && part.trim()));
  return [...new Set(parts)].join(" / ");
}

function orderedColumns(preferences?: HouseholdPreferences | null): HouseholdColumn[] {
  const preferred = preferences?.columnOrder?.length
    ? preferences.columnOrder
    : DEFAULT_HOUSEHOLD_PREFERENCES.columnOrder;
  const seen = new Set<string>();
  const ordered: HouseholdColumn[] = [];
  for (const col of preferred) {
    if ((DEFAULT_HOUSEHOLD_COLUMNS as readonly string[]).includes(col) && !seen.has(col)) {
      ordered.push(col);
      seen.add(col);
    }
  }
  for (const col of DEFAULT_HOUSEHOLD_COLUMNS) {
    if (!seen.has(col)) ordered.push(col);
  }
  return ordered;
}

function lineCells(line: HouseholdLine, columns: HouseholdColumn[]): string[] {
  const map: Record<HouseholdColumn, string> = {
    日付: cellText(line.purchaseDate),
    店舗: cellText(line.storeName),
    カテゴリ: cellText(line.category),
    商品名: cellText(line.itemName),
    数量: cellNumber(line.quantity),
    単価: cellNumber(line.unitPrice),
    金額: cellNumber(line.amount),
    支払方法: cellText(line.paymentMethod),
    メモ: cellText(lineMemo(line)),
  };
  return columns.map((col) => map[col]);
}

function markdownTable(headers: string[], rows: string[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((cell) => cell || "").join(" | ")} |`),
  ].join("\n");
}

type SummaryRow = {
  kind: string;
  item: string;
  amount: number | null;
  count: number | null;
};

function summaryRows(book: HouseholdBookDocument): SummaryRow[] {
  const rows: SummaryRow[] = [
    {
      kind: "総支出",
      item: "",
      amount: book.totalSpend,
      count: null,
    },
    {
      kind: "レシート件数",
      item: "",
      amount: null,
      count: book.receiptCount,
    },
  ];

  const byCategory = new Map<string, number>();
  const byStore = new Map<string, number>();
  const byDay = new Map<string, number>();

  for (const receipt of book.receipts) {
    const spend =
      receipt.total != null
        ? receipt.total
        : receipt.items
            .map((line) => line.amount)
            .filter((value): value is number => value != null)
            .reduce((sum, value) => sum + value, 0);
    if (receipt.total == null && !receipt.items.some((line) => line.amount != null)) {
      continue;
    }
    const store = receipt.storeName ?? "（店舗不明）";
    const day = receipt.purchaseDate ?? "（日付不明）";
    byStore.set(store, (byStore.get(store) ?? 0) + spend);
    byDay.set(day, (byDay.get(day) ?? 0) + spend);
  }

  for (const line of book.lines) {
    if (line.amount == null) continue;
    byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + line.amount);
  }

  for (const [item, amount] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0], "ja"))) {
    rows.push({ kind: "カテゴリ別", item, amount, count: null });
  }
  for (const [item, amount] of [...byStore.entries()].sort((a, b) => a[0].localeCompare(b[0], "ja"))) {
    rows.push({ kind: "店舗別", item, amount, count: null });
  }
  for (const [item, amount] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push({ kind: "日別", item, amount, count: null });
  }
  return rows;
}

export function householdBookToExcelSeed(
  book: HouseholdBookDocument,
  preferences?: HouseholdPreferences | null,
): string {
  const columns = orderedColumns(preferences);
  const detailRows = book.lines.map((line) => lineCells(line, columns));
  const summary = summaryRows(book);
  const notes = book.userMessages.map((message) => `- ${message}`).join("\n");

  return [
    "# 家計簿",
    "レシート写真から作成した家計簿です。読めない項目は空欄のままにし、推測では埋めていません。",
    "",
    "## 明細",
    markdownTable(columns, detailRows.length ? detailRows : [columns.map(() => "")]),
    "",
    "## 集計",
    markdownTable(
      ["集計区分", "項目", "金額", "件数"],
      summary.map((row) => [
        row.kind,
        row.item,
        row.amount == null ? "" : String(row.amount),
        row.count == null ? "" : String(row.count),
      ]),
    ),
    book.userMessages.length ? `\n## 要確認\n${notes}` : "",
  ]
    .filter((block) => block !== "")
    .join("\n");
}

import ExcelJS from "exceljs";

import { neutralizeSpreadsheetCell } from "@/lib/security/spreadsheet-formula";

import type { LedgerEntry } from "./types";
import { buildMonthlyAnalytics } from "./analytics";

const HEADERS = [
  "日付",
  "店舗",
  "カテゴリ",
  "商品",
  "数量",
  "単価",
  "税",
  "税込金額",
  "支払方法",
  "備考",
] as const;

function yearMonthNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Build household ledger .xlsx with detail + monthly summary sheets.
 */
export async function buildHouseholdLedgerWorkbook(
  entries: LedgerEntry[],
  options?: { yearMonth?: string },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MINERVOT";
  workbook.created = new Date();

  const detail = workbook.addWorksheet("家計簿");
  detail.addRow([...HEADERS]);
  for (const entry of entries) {
    detail.addRow([
      neutralizeSpreadsheetCell(entry.date),
      neutralizeSpreadsheetCell(entry.storeName),
      neutralizeSpreadsheetCell(entry.category),
      neutralizeSpreadsheetCell(entry.itemName),
      entry.quantity,
      entry.unitPrice,
      entry.tax,
      entry.amountInclTax,
      neutralizeSpreadsheetCell(entry.paymentMethod),
      neutralizeSpreadsheetCell(entry.note),
    ]);
  }
  detail.getRow(1).font = { bold: true };
  detail.views = [{ state: "frozen", ySplit: 1 }];
  detail.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(entries.length + 1, 1), column: HEADERS.length },
  };

  const yearMonth = options?.yearMonth ?? yearMonthNow();
  const analytics = buildMonthlyAnalytics(entries, yearMonth);
  const summary = workbook.addWorksheet("月次集計");
  summary.addRow(["項目", "値"]);
  summary.addRow(["対象月", analytics.yearMonth]);
  summary.addRow(["総支出", analytics.totalSpend]);
  summary.addRow(["先月総支出", analytics.previousTotal ?? "—"]);
  summary.addRow(["増減額", analytics.deltaAmount ?? "—"]);
  summary.addRow([
    "増減率(%)",
    analytics.deltaPercent != null ? analytics.deltaPercent : "—",
  ]);
  summary.addRow(["AIコメント", analytics.aiComment]);
  summary.addRow([]);
  summary.addRow(["カテゴリ", "金額", "構成比", "グラフ用"]);
  for (const row of analytics.byCategory) {
    summary.addRow([
      row.category,
      row.amount,
      Math.round(row.share * 1000) / 10,
      row.amount,
    ]);
  }
  summary.getRow(1).font = { bold: true };

  const chartData = workbook.addWorksheet("グラフ用データ");
  chartData.addRow(["カテゴリ", "金額"]);
  for (const row of analytics.byCategory) {
    chartData.addRow([row.category, row.amount]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

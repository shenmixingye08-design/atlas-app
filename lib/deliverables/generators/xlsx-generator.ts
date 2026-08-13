import ExcelJS from "exceljs";

import { neutralizeSpreadsheetCell } from "@/lib/security/spreadsheet-formula";

import { enhanceWorkbookWithAdvancedExcel } from "../excel-advanced";
import { extractExcelSheets } from "../excel-data";
import {
  currencyNumFmt,
  dateNumFmt,
  inferColumnKind,
  isReviewPlaceholder,
  NUMBER_NUM_FMT,
  parseDate,
  parseNumber,
  parsePercentage,
  parseTime,
  PERCENT_NUM_FMT,
  TIME_NUM_FMT,
  type ExcelColumnKind,
} from "../excel-workbook/column-types";
import {
  countIfFormula,
  sumFormula,
  sumIfFormula,
  sumIfsMonthFormula,
} from "../excel-workbook/formulas";
import { resolveExcelIntent } from "../excel-workbook/intent";
import {
  applyProfessionalLayout,
  applyTotalRowStyle,
} from "../excel-workbook/layout";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";
import { createDeliverableFile } from "./shared";

type XlsxGenerateOptions = {
  excel?: {
    headerColorArgb?: string | null;
    currency?: string | null;
    dateFormat?: string | null;
    decimalPlaces?: number | null;
    columnOrder?: string[];
    includeChart?: boolean | null;
    includePivot?: boolean | null;
    chartTitle?: string | null;
    /** Original user assignment — used for formula/chart intent. */
    assignment?: string | null;
  } | null;
  companyName?: string | null;
};

type WrittenSheet = {
  name: string;
  headers: string[];
  kinds: ExcelColumnKind[];
  rowCount: number;
};

function typedCell(
  raw: string,
  kind: ExcelColumnKind,
  decimalPlaces: number | null | undefined,
): ExcelJS.CellValue {
  if (isReviewPlaceholder(raw)) {
    return neutralizeSpreadsheetCell(raw) as string;
  }
  if (kind === "percentage") {
    const pct = parsePercentage(raw);
    if (pct != null) return pct;
  }
  if (kind === "currency" || kind === "number") {
    const num = parseNumber(raw);
    if (num != null) {
      if (decimalPlaces != null) return Number(num.toFixed(decimalPlaces));
      return num;
    }
  }
  if (kind === "date") {
    const dt = parseDate(raw);
    if (dt) return dt;
  }
  if (kind === "time") {
    const t = parseTime(raw);
    if (t != null) return t;
  }
  return neutralizeSpreadsheetCell(raw);
}

function applyNumFmt(
  cell: ExcelJS.Cell,
  kind: ExcelColumnKind,
  options?: XlsxGenerateOptions,
): void {
  const numeric =
    typeof cell.value === "number" ||
    cell.value instanceof Date ||
    (typeof cell.value === "object" &&
      cell.value != null &&
      "formula" in cell.value);
  if (!numeric) return;
  if (kind === "currency") {
    cell.numFmt = currencyNumFmt(options?.excel?.currency);
  } else if (kind === "percentage") {
    cell.numFmt = PERCENT_NUM_FMT;
  } else if (kind === "number") {
    const places = options?.excel?.decimalPlaces;
    cell.numFmt =
      places != null && places > 0 ? `0.${"0".repeat(places)}` : NUMBER_NUM_FMT;
  } else if (kind === "date") {
    cell.numFmt = dateNumFmt(options?.excel?.dateFormat);
  } else if (kind === "time") {
    cell.numFmt = TIME_NUM_FMT;
  }
}

function columnSum(rows: string[][], colIdx: number): number {
  let total = 0;
  for (const row of rows) {
    const num = parseNumber(String(row[colIdx] ?? ""));
    if (num != null) total += num;
  }
  return total;
}

function addMonthlySheet(workbook: ExcelJS.Workbook, source: WrittenSheet): void {
  if (workbook.getWorksheet("月別集計")) return;
  const dateCol = source.kinds.findIndex((k) => k === "date");
  const amountCol = source.kinds.findIndex(
    (k) => k === "currency" || k === "number",
  );
  if (dateCol < 0 || amountCol < 0 || source.rowCount < 1) return;

  const detail = workbook.getWorksheet(source.name);
  if (!detail) return;
  const months = new Map<string, number>();
  for (let r = 2; r <= source.rowCount + 1; r += 1) {
    const dateValue = detail.getRow(r).getCell(dateCol + 1).value;
    const amountValue = detail.getRow(r).getCell(amountCol + 1).value;
    if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
      continue;
    }
    if (typeof amountValue !== "number") continue;
    const key = `${dateValue.getUTCFullYear()}-${String(dateValue.getUTCMonth() + 1).padStart(2, "0")}`;
    months.set(key, (months.get(key) ?? 0) + amountValue);
  }
  if (months.size === 0) return;

  const sheet = workbook.addWorksheet("月別集計");
  sheet.addRow(["年月", "合計"]);
  const sorted = [...months.keys()].sort();
  for (const key of sorted) {
    const [year, month] = key.split("-").map(Number);
    const row = sheet.addRow([key, months.get(key) ?? 0]);
    row.getCell(2).value = {
      formula: sumIfsMonthFormula({
        sourceSheet: source.name,
        dateCol0: dateCol,
        valueCol0: amountCol,
        year: year!,
        month: month!,
      }),
      result: months.get(key) ?? 0,
    };
    row.getCell(2).numFmt = '"¥"#,##0';
  }
  applyProfessionalLayout(sheet, sorted.length + 1, 2, "FF1F4E79");
  const grand = [...months.values()].reduce((a, b) => a + b, 0);
  const totalRow = sheet.addRow([
    "合計",
    {
      formula: sumFormula(1, 2, sorted.length + 1),
      result: grand,
    },
  ]);
  totalRow.getCell(2).numFmt = '"¥"#,##0';
  applyTotalRowStyle(sheet, totalRow.number, 2);
}

function addCategorySheet(workbook: ExcelJS.Workbook, source: WrittenSheet): void {
  if (workbook.getWorksheet("カテゴリ別集計")) return;
  if (workbook.getWorksheet("ピボット集計")) return;
  const categoryCol = source.headers.findIndex((h) =>
    /カテゴリ|分類|店名|部門|channel/i.test(h),
  );
  const amountCol = source.kinds.findIndex(
    (k) => k === "currency" || k === "number",
  );
  if (categoryCol < 0 || amountCol < 0 || source.rowCount < 1) return;

  const detail = workbook.getWorksheet(source.name);
  if (!detail) return;
  const totals = new Map<string, number>();
  for (let r = 2; r <= source.rowCount + 1; r += 1) {
    const category = String(
      detail.getRow(r).getCell(categoryCol + 1).value ?? "",
    ).trim();
    const amountValue = detail.getRow(r).getCell(amountCol + 1).value;
    if (!category || category === "合計") continue;
    if (typeof amountValue !== "number") continue;
    totals.set(category, (totals.get(category) ?? 0) + amountValue);
  }
  if (totals.size === 0) return;

  const sheet = workbook.addWorksheet("カテゴリ別集計");
  sheet.addRow(["カテゴリ", "合計", "件数"]);
  const sorted = [...totals.keys()].sort((a, b) => a.localeCompare(b, "ja"));
  for (const category of sorted) {
    const excelRow = sheet.addRow([category, totals.get(category) ?? 0, 0]);
    excelRow.getCell(2).value = {
      formula: sumIfFormula({
        sourceSheet: source.name,
        criteriaCol0: categoryCol,
        criteriaCell: `A${excelRow.number}`,
        valueCol0: amountCol,
      }),
      result: totals.get(category) ?? 0,
    };
    excelRow.getCell(3).value = {
      formula: countIfFormula({
        sourceSheet: source.name,
        criteriaCol0: categoryCol,
        criteriaCell: `A${excelRow.number}`,
      }),
      result: 0,
    };
    excelRow.getCell(2).numFmt = '"¥"#,##0';
  }
  applyProfessionalLayout(sheet, sorted.length + 1, 3, "FF1F4E79");
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  const totalRow = sheet.addRow([
    "合計",
    {
      formula: sumFormula(1, 2, sorted.length + 1),
      result: grand,
    },
    {
      formula: sumFormula(2, 2, sorted.length + 1),
      result: 0,
    },
  ]);
  totalRow.getCell(2).numFmt = '"¥"#,##0';
  applyTotalRowStyle(sheet, totalRow.number, 3);
}

/**
 * Excel (.xlsx) generator — SoT workbook builder via exceljs.
 * Typed cells, trusted formulas, freeze/filter, optional monthly + pivot/chart.
 */
export class XlsxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "xlsx" as const;

  async generate(
    content: string,
    baseFileName: string,
    options?: XlsxGenerateOptions,
  ): Promise<GeneratedDeliverableFile> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = options?.companyName ?? "MINERVOT";
    workbook.created = new Date();
    if (workbook.calcProperties) {
      workbook.calcProperties.fullCalcOnLoad = true;
    }

    const sheets = extractExcelSheets(content);
    const intent = resolveExcelIntent({
      assignment: options?.excel?.assignment ?? content.slice(0, 400),
      sheetNames: sheets.map((s) => s.name),
      headers: sheets.map((s) => s.headers),
      rowCounts: sheets.map((s) => s.rows.length),
    });

    const headerColor = options?.excel?.headerColorArgb ?? "FF1F4E79";
    const written: WrittenSheet[] = [];

    for (const data of sheets) {
      const sheet = workbook.addWorksheet(data.name);
      let headers = [...data.headers];
      let rows = data.rows.map((row) => [...row]);
      let declaredKinds = data.kinds ? [...data.kinds] : undefined;
      const preferredOrder = options?.excel?.columnOrder ?? [];
      if (preferredOrder.length > 0 && headers.length > 0) {
        const indexMap = preferredOrder
          .map((name) => headers.findIndex((h) => h === name))
          .filter((idx) => idx >= 0);
        const remaining = headers
          .map((_, idx) => idx)
          .filter((idx) => !indexMap.includes(idx));
        const order = [...indexMap, ...remaining];
        headers = order.map((idx) => headers[idx] ?? "");
        rows = rows.map((row) => order.map((idx) => row[idx] ?? ""));
        if (declaredKinds) {
          declaredKinds = order.map((idx) => declaredKinds![idx] ?? "text");
        }
      }
      const columnCount = Math.max(
        headers.length,
        ...rows.map((row) => row.length),
        1,
      );
      const header = [...headers];
      while (header.length < columnCount) header.push("");

      const kinds: ExcelColumnKind[] = header.map((h, colIdx) => {
        if (declaredKinds?.[colIdx]) return declaredKinds[colIdx]!;
        const samples = rows.map((row) => String(row[colIdx] ?? ""));
        return inferColumnKind(h, samples);
      });

      sheet.addRow(header.map((cell) => neutralizeSpreadsheetCell(cell)));

      for (const row of rows) {
        const cells = [...row];
        while (cells.length < columnCount) cells.push("");
        const excelRow = sheet.addRow(
          cells.map((cell, colIdx) =>
            typedCell(
              String(cell ?? ""),
              kinds[colIdx] ?? "text",
              options?.excel?.decimalPlaces,
            ),
          ),
        );
        for (let col = 1; col <= columnCount; col += 1) {
          applyNumFmt(excelRow.getCell(col), kinds[col - 1] ?? "text", options);
        }
      }

      const dataRows = rows.length;
      applyProfessionalLayout(
        sheet,
        Math.max(dataRows + 1, 1),
        columnCount,
        headerColor,
      );

      if (intent.formulas && dataRows >= 1) {
        const totalValues: ExcelJS.CellValue[] = header.map((_h, colIdx) => {
          const kind = kinds[colIdx] ?? "text";
          if (colIdx === 0) return "合計";
          if (kind === "currency" || kind === "number") {
            return {
              formula: sumFormula(colIdx, 2, dataRows + 1),
              result: columnSum(rows, colIdx),
            };
          }
          return "";
        });
        if (totalValues.some((v) => typeof v === "object" && v && "formula" in v)) {
          const totalRow = sheet.addRow(totalValues);
          for (let col = 1; col <= columnCount; col += 1) {
            applyNumFmt(totalRow.getCell(col), kinds[col - 1] ?? "text", options);
          }
          applyTotalRowStyle(sheet, totalRow.number, columnCount);
        }
      }

      written.push({
        name: sheet.name,
        headers: header,
        kinds,
        rowCount: dataRows,
      });
    }

    if (intent.monthlySheet && written[0]) {
      addMonthlySheet(workbook, written[0]);
    }

    const includeChart =
      options?.excel?.includeChart === true
        ? true
        : options?.excel?.includeChart === false
          ? false
          : intent.chart;
    const includePivot =
      options?.excel?.includePivot === true
        ? true
        : options?.excel?.includePivot === false
          ? false
          : intent.categorySheet || intent.chart;

    if (intent.categorySheet && !includePivot && written[0]) {
      addCategorySheet(workbook, written[0]);
    }

    const enhanced = await enhanceWorkbookWithAdvancedExcel(workbook, {
      includeChart,
      includePivot,
      chartTitle:
        options?.excel?.chartTitle ??
        (intent.kind === "ledger"
          ? "カテゴリ別支出"
          : intent.kind === "sales"
            ? "カテゴリ別売上"
            : null),
    });

    return createDeliverableFile("xlsx", baseFileName, enhanced.buffer, false);
  }
}

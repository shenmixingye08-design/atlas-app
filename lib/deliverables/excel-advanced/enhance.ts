/**
 * Apply pivot aggregation sheet + OOXML chart to an exceljs Workbook (P3-03).
 */

import type ExcelJS from "exceljs";

import { sumIfFormula } from "@/lib/deliverables/excel-workbook/formulas";

import {
  injectPivotChartIntoXlsx,
  inspectXlsxAdvancedParts,
} from "./chart-ooxml";
import {
  PIVOT_SHEET_NAME,
  planPivotFromSheets,
  type PivotSourceSheet,
} from "./pivot";

export type AdvancedExcelOptions = {
  /** Default auto when aggregatable. Explicit false disables. */
  includeChart?: boolean | null;
  /** Default auto when aggregatable. Explicit false disables. */
  includePivot?: boolean | null;
  chartTitle?: string | null;
};

export type AdvancedExcelEnhanceResult = {
  pivotAdded: boolean;
  chartInjected: boolean;
  drawingInjected: boolean;
  categoryCount: number;
  skippedReason: string | null;
  buffer: Buffer;
};

function readSheetAsSource(sheet: ExcelJS.Worksheet): PivotSourceSheet | null {
  if (sheet.rowCount < 2 || sheet.columnCount < 2) return null;
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  for (let col = 1; col <= sheet.columnCount; col += 1) {
    const value = headerRow.getCell(col).value;
    headers.push(value == null ? "" : String(value));
  }
  if (headers.every((h) => !h.trim())) return null;

  const rows: Array<Array<string | number | Date | null | undefined>> = [];
  for (let rowIdx = 2; rowIdx <= sheet.rowCount; rowIdx += 1) {
    const excelRow = sheet.getRow(rowIdx);
    const cells: Array<string | number | Date | null | undefined> = [];
    for (let col = 1; col <= headers.length; col += 1) {
      const raw = excelRow.getCell(col).value;
      if (raw == null) {
        cells.push("");
      } else if (typeof raw === "number" || raw instanceof Date) {
        cells.push(raw);
      } else if (typeof raw === "object" && "result" in raw) {
        const result = (raw as { result?: unknown }).result;
        cells.push(
          typeof result === "number" || result instanceof Date
            ? result
            : String(result ?? ""),
        );
      } else {
        cells.push(String(raw));
      }
    }
    if (String(cells[0] ?? "").trim() === "合計") continue;
    if (cells.some((c) => c !== "" && c != null)) {
      rows.push(cells);
    }
  }
  if (rows.length < 1) return null;
  return { name: sheet.name, headers, rows };
}

function wantFeature(
  flag: boolean | null | undefined,
  autoEligible: boolean,
): boolean {
  if (flag === false) return false;
  if (flag === true) return true;
  return autoEligible;
}

/**
 * Add pivot sheet to workbook (mutates), write buffer, inject chart OOXML.
 */
export async function enhanceWorkbookWithAdvancedExcel(
  workbook: ExcelJS.Workbook,
  options?: AdvancedExcelOptions,
): Promise<AdvancedExcelEnhanceResult> {
  const sources: PivotSourceSheet[] = [];
  workbook.eachSheet((sheet) => {
    const source = readSheetAsSource(sheet);
    if (source) sources.push(source);
  });

  const plan = planPivotFromSheets(sources);
  const autoEligible = Boolean(plan && plan.rows.length >= 1);
  const includePivot = wantFeature(options?.includePivot, autoEligible);
  const includeChart = wantFeature(options?.includeChart, autoEligible);

  // Fail-closed: explicit chart/pivot request with no aggregatable data.
  if (!plan && (options?.includeChart === true || options?.includePivot === true)) {
    throw new Error("excel_advanced_no_aggregatable_columns");
  }

  if (!plan || (!includePivot && !includeChart)) {
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return {
      pivotAdded: false,
      chartInjected: false,
      drawingInjected: false,
      categoryCount: 0,
      skippedReason: !plan ? "no_aggregatable_columns" : "advanced_disabled",
      buffer: Buffer.from(arrayBuffer),
    };
  }

  // Remove prior pivot sheet for idempotent regenerate.
  const existing = workbook.getWorksheet(PIVOT_SHEET_NAME);
  if (existing) {
    workbook.removeWorksheet(existing.id);
  }

  let pivotAdded = false;
  let lastDataRow = 1;
  if (includePivot || includeChart) {
    const pivotSheet = workbook.addWorksheet(PIVOT_SHEET_NAME);
    pivotSheet.addRow([plan.categoryHeader || "カテゴリ", "合計"]);
    for (const row of plan.rows) {
      const excelRow = pivotSheet.addRow([row.category, row.total]);
      excelRow.getCell(2).value = {
        formula: sumIfFormula({
          sourceSheet: plan.sourceSheetName,
          criteriaCol0: plan.categoryCol,
          criteriaCell: `A${excelRow.number}`,
          valueCol0: plan.valueCol,
        }),
        result: row.total,
      };
      excelRow.getCell(2).numFmt = '"¥"#,##0';
    }
    lastDataRow = plan.rows.length + 1;
    const header = pivotSheet.getRow(1);
    header.font = { bold: true, name: "Yu Gothic", size: 11, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E79" },
    };
    pivotSheet.views = [{ state: "frozen", ySplit: 1 }];
    pivotSheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: lastDataRow, column: 2 },
    };
    pivotSheet.getColumn(1).width = 18;
    pivotSheet.getColumn(2).width = 14;
    pivotAdded = true;
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  let buffer = Buffer.from(arrayBuffer);

  if (!includeChart) {
    return {
      pivotAdded,
      chartInjected: false,
      drawingInjected: false,
      categoryCount: plan.rows.length,
      skippedReason: "chart_disabled",
      buffer,
    };
  }

  const injected = await injectPivotChartIntoXlsx(buffer, {
    sheetName: PIVOT_SHEET_NAME,
    title: options?.chartTitle?.trim() || "カテゴリ別合計",
    lastDataRow,
  });

  if (!injected.chartInjected) {
    // Fail-closed for explicit includeChart=true: do not pretend success.
    if (options?.includeChart === true) {
      throw new Error(
        `excel_chart_inject_failed:${injected.error ?? "unknown"}`,
      );
    }
    return {
      pivotAdded,
      chartInjected: false,
      drawingInjected: false,
      categoryCount: plan.rows.length,
      skippedReason: injected.error ?? "chart_inject_failed",
      buffer,
    };
  }

  buffer = Buffer.from(injected.buffer);
  const parts = await inspectXlsxAdvancedParts(buffer);
  if (!parts.hasChart || !parts.hasDrawing || !parts.hasPivotSheet) {
    if (options?.includeChart === true) {
      throw new Error("excel_advanced_parts_missing_after_inject");
    }
    return {
      pivotAdded,
      chartInjected: false,
      drawingInjected: false,
      categoryCount: plan.rows.length,
      skippedReason: "parts_missing_after_inject",
      buffer: Buffer.from(arrayBuffer),
    };
  }

  return {
    pivotAdded,
    chartInjected: true,
    drawingInjected: true,
    categoryCount: plan.rows.length,
    skippedReason: null,
    buffer,
  };
}

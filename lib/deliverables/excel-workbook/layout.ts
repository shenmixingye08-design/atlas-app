import type ExcelJS from "exceljs";

import { REVIEW_PLACEHOLDER } from "./column-types";

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB0B0B0" } },
  left: { style: "thin", color: { argb: "FFB0B0B0" } },
  bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
  right: { style: "thin", color: { argb: "FFB0B0B0" } },
};

function cellDisplayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    width += char.charCodeAt(0) > 255 ? 2 : 1;
  }
  return width;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "formula" in value) {
    return String((value as ExcelJS.CellFormulaValue).formula ?? "");
  }
  return String(value);
}

export function autofitColumns(
  sheet: ExcelJS.Worksheet,
  columnCount: number,
  sampleRows = 80,
): void {
  const last = sheet.rowCount;
  for (let col = 1; col <= columnCount; col += 1) {
    let max = 8;
    const column = sheet.getColumn(col);
    const limit = Math.min(last, sampleRows);
    for (let row = 1; row <= limit; row += 1) {
      max = Math.max(max, cellDisplayWidth(cellText(sheet.getRow(row).getCell(col).value)));
    }
    if (last > limit) {
      max = Math.max(
        max,
        cellDisplayWidth(cellText(sheet.getRow(last).getCell(col).value)),
      );
    }
    column.width = Math.min(Math.max(max + 2, 10), 48);
  }
}

export function applyProfessionalLayout(
  sheet: ExcelJS.Worksheet,
  rowCount: number,
  columnCount: number,
  headerColorArgb: string,
): void {
  if (columnCount < 1 || rowCount < 1) return;

  const header = sheet.getRow(1);
  header.font = {
    bold: true,
    name: "Yu Gothic",
    size: 11,
    color: { argb: "FFFFFFFF" },
  };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: headerColorArgb },
  };
  header.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  header.height = 22;

  for (let row = 1; row <= rowCount; row += 1) {
    const excelRow = sheet.getRow(row);
    excelRow.font = {
      ...(excelRow.font ?? {}),
      name: excelRow.font?.name ?? "Yu Gothic",
      size: excelRow.font?.size ?? 11,
      bold: row === 1 ? true : excelRow.font?.bold,
    };
    let needsWrap = false;
    for (let col = 1; col <= columnCount; col += 1) {
      const cell = excelRow.getCell(col);
      cell.border = THIN_BORDER;
      const numeric =
        typeof cell.value === "number" ||
        (typeof cell.value === "object" &&
          cell.value != null &&
          "formula" in cell.value);
      cell.alignment = {
        vertical: "middle",
        horizontal: numeric ? "right" : "left",
        wrapText: true,
      };
      const text = cellText(cell.value);
      if (text.length > 24) needsWrap = true;
      if (text === REVIEW_PLACEHOLDER) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFF3CD" },
        };
      }
    }
    if (row > 1) {
      excelRow.height = needsWrap ? 32 : 18;
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rowCount, column: columnCount },
  };
  sheet.views = [{ state: "frozen", ySplit: 1, activeCell: "A2" }];
  sheet.pageSetup = {
    paperSize: 9,
    orientation: columnCount > 6 ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:1",
  };
  autofitColumns(sheet, columnCount);
}

/** Style a totals row added after autoFilter so it stays outside the filter range. */
export function applyTotalRowStyle(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  columnCount: number,
): void {
  const excelRow = sheet.getRow(rowNumber);
  excelRow.font = { bold: true, name: "Yu Gothic", size: 11 };
  excelRow.height = 20;
  for (let col = 1; col <= columnCount; col += 1) {
    const cell = excelRow.getCell(col);
    cell.border = THIN_BORDER;
    const numeric =
      typeof cell.value === "number" ||
      (typeof cell.value === "object" &&
        cell.value != null &&
        "formula" in cell.value);
    cell.alignment = {
      vertical: "middle",
      horizontal: numeric ? "right" : "left",
      wrapText: true,
    };
  }
}

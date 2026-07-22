import "server-only";

import ExcelJS from "exceljs";

import { extractExcelSheets } from "../excel-tables";
import type { ExcelSheetData } from "../excel-tables";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { createDeliverableFile } from "./shared";

const HEADER_FILL = "FF1F4E79";
const HEADER_FONT = "FFFFFFFF";
const BORDER_COLOR = "FFB0B7C3";

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};

function cellDisplayLength(value: string | number | Date | null | ""): number {
  if (value == null || value === "") return 0;
  if (value instanceof Date) return 12;
  const text = String(value);
  let width = 0;
  for (const char of text) {
    width += /[\u3000-\u9fff\uff00-\uffef]/.test(char) ? 2 : 1;
  }
  return width;
}

function applyColumnWidths(
  worksheet: ExcelJS.Worksheet,
  headers: string[],
  rows: Array<Array<string | number | Date | null>>,
): void {
  headers.forEach((header, columnIndex) => {
    const column = worksheet.getColumn(columnIndex + 1);
    let max = cellDisplayLength(header);
    for (const row of rows) {
      max = Math.max(max, cellDisplayLength(row[columnIndex] ?? null));
    }
    column.width = Math.min(Math.max(max + 2, 10), 48);
  });
}

function tableNameFor(sheetName: string, index: number): string {
  const cleaned = sheetName.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40);
  return `Table_${cleaned || "Data"}_${index + 1}`;
}

function writeSheet(
  workbook: ExcelJS.Workbook,
  sheet: ExcelSheetData,
  index: number,
): void {
  const worksheet = workbook.addWorksheet(sheet.name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = sheet.headers.map((header) => header || "列");
  const bodyRows =
    sheet.rows.length > 0
      ? sheet.rows
      : [headers.map(() => null as string | number | Date | null)];

  // Prefer native Excel Table (includes filters + banded rows).
  try {
    worksheet.addTable({
      name: tableNameFor(sheet.name, index),
      ref: "A1",
      headerRow: true,
      totalsRow: false,
      style: {
        theme: "TableStyleMedium2",
        showRowStripes: true,
      },
      columns: headers.map((name) => ({
        name,
        filterButton: true,
      })),
      rows: bodyRows.map((row) =>
        row.map((value) => (value == null ? "" : value)),
      ),
    });
  } catch {
    worksheet.addRow(headers);
    for (const row of bodyRows) {
      worksheet.addRow(row.map((value) => (value == null ? "" : value)));
    }
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: bodyRows.length + 1, column: headers.length },
    };
  }

  const rowCount = bodyRows.length + 1;
  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let colNumber = 1; colNumber <= headers.length; colNumber += 1) {
      const cell = row.getCell(colNumber);
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: "middle", wrapText: true };

      if (rowNumber === 1) {
        cell.font = { bold: true, color: { argb: HEADER_FONT } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: HEADER_FILL },
        };
        cell.value = headers[colNumber - 1];
        continue;
      }

      const raw = bodyRows[rowNumber - 2]?.[colNumber - 1] ?? null;
      if (raw instanceof Date) {
        cell.value = raw;
        cell.numFmt = "yyyy-mm-dd";
      } else if (typeof raw === "number") {
        cell.value = raw;
        cell.numFmt = Number.isInteger(raw) ? "#,##0" : "#,##0.##";
      } else if (typeof raw === "string") {
        cell.value = raw;
      } else {
        cell.value = "";
      }
    }
  }

  applyColumnWidths(worksheet, headers, bodyRows);
}

export async function buildXlsxBuffer(content: string): Promise<Buffer> {
  const sheets = extractExcelSheets(content);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MINERVOT";
  workbook.created = new Date();
  workbook.modified = new Date();

  sheets.forEach((sheet, index) => {
    writeSheet(workbook, sheet, index);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** Production Excel (.xlsx) generator using exceljs. */
export class XlsxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "xlsx" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    const buffer = await buildXlsxBuffer(content);
    return createDeliverableFile("xlsx", baseFileName, buffer, false);
  }
}

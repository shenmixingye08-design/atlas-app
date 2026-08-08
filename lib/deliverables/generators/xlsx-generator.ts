import ExcelJS from "exceljs";

import { neutralizeSpreadsheetCell } from "@/lib/security/spreadsheet-formula";

import { extractExcelSheets } from "../excel-data";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";
import { createDeliverableFile } from "./shared";

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB0B0B0" } },
  left: { style: "thin", color: { argb: "FFB0B0B0" } },
  bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
  right: { style: "thin", color: { argb: "FFB0B0B0" } },
};

/** Approximate display width for mixed Japanese / ASCII text. */
function cellDisplayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    width += char.charCodeAt(0) > 255 ? 2 : 1;
  }
  return width;
}

function autofitColumns(sheet: ExcelJS.Worksheet, columnCount: number): void {
  for (let col = 1; col <= columnCount; col += 1) {
    let max = 8;
    const column = sheet.getColumn(col);
    column.eachCell({ includeEmpty: true }, (cell) => {
      const text =
        cell.value == null
          ? ""
          : typeof cell.value === "string"
            ? cell.value
            : String(cell.value);
      max = Math.max(max, cellDisplayWidth(text));
    });
    column.width = Math.min(Math.max(max + 2, 10), 60);
  }
}

type XlsxGenerateOptions = {
  excel?: {
    headerColorArgb?: string | null;
    currency?: string | null;
    dateFormat?: string | null;
    decimalPlaces?: number | null;
    columnOrder?: string[];
  } | null;
  companyName?: string | null;
};

function applySheetFormatting(
  sheet: ExcelJS.Worksheet,
  rowCount: number,
  columnCount: number,
  options?: XlsxGenerateOptions,
): void {
  if (columnCount < 1 || rowCount < 1) return;

  const header = sheet.getRow(1);
  header.font = { bold: true, name: "Yu Gothic", size: 11, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: options?.excel?.headerColorArgb ?? "FF1F4E79",
    },
  };
  header.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

  for (let row = 1; row <= rowCount; row += 1) {
    const excelRow = sheet.getRow(row);
    excelRow.font = {
      ...(excelRow.font ?? {}),
      name: excelRow.font?.name ?? "Yu Gothic",
      size: excelRow.font?.size ?? 11,
      bold: row === 1 ? true : excelRow.font?.bold,
    };
    for (let col = 1; col <= columnCount; col += 1) {
      const cell = excelRow.getCell(col);
      cell.border = THIN_BORDER;
      cell.alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
      };
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rowCount, column: columnCount },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autofitColumns(sheet, columnCount);
}

/**
 * Excel (.xlsx) generator — builds worksheets from AI table data via exceljs.
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

    const sheets = extractExcelSheets(content);
    for (const data of sheets) {
      const sheet = workbook.addWorksheet(data.name);
      let headers = [...data.headers];
      let rows = data.rows.map((row) => [...row]);
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
      }
      const columnCount = Math.max(
        headers.length,
        ...rows.map((row) => row.length),
        1,
      );
      const header = [...headers];
      while (header.length < columnCount) header.push("");
      sheet.addRow(header.map((cell) => neutralizeSpreadsheetCell(cell)));
      for (const row of rows) {
        const cells = [...row];
        while (cells.length < columnCount) cells.push("");
        // Memory-driven number formatting (currency / decimals)
        // P0-05: neutralize formula / HYPERLINK injection from user/OCR text.
        sheet.addRow(
          cells.map((cell) => {
            if (
              options?.excel?.decimalPlaces != null &&
              typeof cell === "string" &&
              /^-?\d+(\.\d+)?$/.test(cell)
            ) {
              return Number(Number(cell).toFixed(options.excel.decimalPlaces));
            }
            return neutralizeSpreadsheetCell(cell);
          }),
        );
      }
      applySheetFormatting(sheet, rows.length + 1, columnCount, options);
      if (options?.excel?.currency) {
        sheet.getCell(1, columnCount + 1).value = `通貨:${options.excel.currency}`;
      }
      if (options?.excel?.dateFormat) {
        sheet.getCell(2, columnCount + 1).value = `日付:${options.excel.dateFormat}`;
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return createDeliverableFile("xlsx", baseFileName, buffer, false);
  }
}

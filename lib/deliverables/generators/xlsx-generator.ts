import ExcelJS from "exceljs";

import { extractExcelSheets } from "../excel-data";
import type {
  DeliverableGenerateOptions,
  DeliverableGenerator,
  GeneratedDeliverableFile,
} from "../types";
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

function applySheetFormatting(
  sheet: ExcelJS.Worksheet,
  rowCount: number,
  columnCount: number,
): void {
  if (columnCount < 1 || rowCount < 1) return;

  const header = sheet.getRow(1);
  header.font = { bold: true, name: "Yu Gothic", size: 11, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  header.height = 22;

  for (let row = 1; row <= rowCount; row += 1) {
    const excelRow = sheet.getRow(row);
    excelRow.font = {
      ...(excelRow.font ?? {}),
      name: excelRow.font?.name ?? "Yu Gothic",
      size: excelRow.font?.size ?? 11,
      bold: row === 1 ? true : excelRow.font?.bold,
      color:
        row === 1
          ? { argb: "FFFFFFFF" }
          : excelRow.font?.color,
    };
    for (let col = 1; col <= columnCount; col += 1) {
      const cell = excelRow.getCell(col);
      cell.border = THIN_BORDER;
      cell.alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: true,
      };
      if (row === 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1F4E79" },
        };
      } else if (row % 2 === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF7F9FC" },
        };
      }
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
    _options?: DeliverableGenerateOptions,
  ): Promise<GeneratedDeliverableFile> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MINERVOT";
    workbook.created = new Date();

    const sheets = extractExcelSheets(content);
    for (const data of sheets) {
      const sheet = workbook.addWorksheet(data.name);
      const columnCount = Math.max(
        data.headers.length,
        ...data.rows.map((row) => row.length),
        1,
      );
      const header = [...data.headers];
      while (header.length < columnCount) header.push("");
      sheet.addRow(header);
      for (const row of data.rows) {
        const cells = [...row];
        while (cells.length < columnCount) cells.push("");
        sheet.addRow(cells);
      }
      applySheetFormatting(sheet, data.rows.length + 1, columnCount);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return createDeliverableFile("xlsx", baseFileName, buffer, false);
  }
}

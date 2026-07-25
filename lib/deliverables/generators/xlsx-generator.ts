import ExcelJS from "exceljs";

import { buildExcelPayload, coerceCell } from "@/lib/artifact-engine/excel-schema";
import type { ArtifactType } from "@/lib/artifact-engine/types";
import type {
  DeliverableGenerateOptions,
  DeliverableGenerator,
  GeneratedDeliverableFile,
} from "../types";
import { createDeliverableFile, formatGeneratedDate } from "./shared";

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

/**
 * Excel (.xlsx) generator — schema-aware sheets via exceljs.
 * Throws when content is not spreadsheet-applicable (engine should skip).
 */
export class XlsxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "xlsx" as const;

  async generate(
    content: string,
    baseFileName: string,
    options?: DeliverableGenerateOptions,
  ): Promise<GeneratedDeliverableFile> {
    const payload = buildExcelPayload({
      artifactType: (options?.artifactType as ArtifactType) || "general",
      assignment: options?.assignment || "",
      content,
    });

    if (!payload.applicable || payload.sheets.length === 0) {
      throw new Error(
        payload.reason || "この成果物はExcel向けの構造ではありません",
      );
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MINERVOT";
    workbook.created = new Date();

    // Cover meta sheet
    const meta = workbook.addWorksheet("表紙");
    meta.addRow(["成果物タイトル", options?.title || baseFileName]);
    meta.addRow(["作成日時", formatGeneratedDate()]);
    meta.addRow(["作成", "MINERVOT"]);
    meta.getColumn(1).width = 18;
    meta.getColumn(2).width = 48;
    meta.getRow(1).font = { bold: true, name: "Yu Gothic", size: 12 };

    for (let sheetIndex = 0; sheetIndex < payload.sheets.length; sheetIndex += 1) {
      const data = payload.sheets[sheetIndex]!;
      const kinds = payload.columnKinds[sheetIndex] ?? data.headers.map(() => "text" as const);
      const sheet = workbook.addWorksheet(data.name.slice(0, 31) || `Sheet${sheetIndex + 1}`);
      const columnCount = Math.max(data.headers.length, 1);

      sheet.addRow(data.headers);
      for (const row of data.rows) {
        const values = data.headers.map((_, colIndex) => {
          const raw = row[colIndex] ?? "";
          const kind = kinds[colIndex] ?? "text";
          return coerceCell(String(raw), kind);
        });
        sheet.addRow(values);
      }

      if (payload.includeTotalRow && payload.totalColumnIndex >= 0 && data.rows.length > 0) {
        const totalRow = sheet.addRow(
          data.headers.map((_, colIndex) => {
            if (colIndex === 0) return "合計";
            if (colIndex === payload.totalColumnIndex) {
              const colLetter = String.fromCharCode(65 + colIndex);
              return {
                formula: `SUM(${colLetter}2:${colLetter}${data.rows.length + 1})`,
              };
            }
            return "";
          }),
        );
        totalRow.font = { bold: true, name: "Yu Gothic", size: 11 };
      }

      const rowCount = sheet.rowCount;
      const header = sheet.getRow(1);
      header.font = {
        bold: true,
        name: "Yu Gothic",
        size: 11,
        color: { argb: "FFFFFFFF" },
      };
      header.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      header.height = 22;

      for (let row = 1; row <= rowCount; row += 1) {
        const excelRow = sheet.getRow(row);
        excelRow.font = {
          ...(excelRow.font ?? {}),
          name: "Yu Gothic",
          size: 11,
          bold: row === 1 ? true : excelRow.font?.bold,
          color: row === 1 ? { argb: "FFFFFFFF" } : excelRow.font?.color,
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

          const kind = kinds[col - 1];
          if (kind === "currency" && row > 1) {
            cell.numFmt = "¥#,##0";
          } else if (kind === "date" && row > 1 && cell.value instanceof Date) {
            cell.numFmt = "yyyy-mm-dd";
          }
        }
      }

      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(1, data.rows.length + 1), column: columnCount },
      };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      autofitColumns(sheet, columnCount);
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return createDeliverableFile("xlsx", baseFileName, buffer, false);
  }
}

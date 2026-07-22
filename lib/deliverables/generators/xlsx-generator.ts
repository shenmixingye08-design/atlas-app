import "server-only";

import ExcelJS from "exceljs";

import {
  analysisToXlsxBuffer,
  suggestAnalysisFileBaseName,
} from "@/lib/image-analysis/excel";
import type { ImageAnalysisResult } from "@/lib/image-analysis/types";
import { parseImageAnalysisJson } from "@/lib/image-analysis/schemas";

import { parseDeliverableContent } from "../parse-content";
import type { ContentBlock } from "../parse-content";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";
import { createDeliverableFile } from "./shared";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E79" },
};
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB0B8C4" } },
  left: { style: "thin", color: { argb: "FFB0B8C4" } },
  bottom: { style: "thin", color: { argb: "FFB0B8C4" } },
  right: { style: "thin", color: { argb: "FFB0B8C4" } },
};

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, "").trim().slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

function extractJsonAnalysis(content: string): ImageAnalysisResult | null {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? content;
  try {
    const parsed = JSON.parse(candidate) as unknown;
    const validated = parseImageAnalysisJson(parsed);
    return validated.ok ? validated.data : null;
  } catch {
    return null;
  }
}

async function workbookFromMarkdownTables(
  content: string,
): Promise<Buffer | null> {
  const parsed = parseDeliverableContent(content);
  const tables: Array<{ name: string; headers: string[]; rows: string[][] }> =
    [];

  for (const section of parsed.sections) {
    const sectionTables = section.blocks.filter(
      (block): block is Extract<ContentBlock, { type: "table" }> =>
        block.type === "table",
    );
    sectionTables.forEach((table, index) => {
      tables.push({
        name: sanitizeSheetName(
          `${section.title}${sectionTables.length > 1 ? ` ${index + 1}` : ""}`,
          tables.length,
        ),
        headers: table.headers,
        rows: table.rows,
      });
    });
  }

  if (tables.length === 0) return null;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MINERVOT";

  for (const table of tables) {
    const sheet = workbook.addWorksheet(table.name);
    const header = sheet.addRow(table.headers);
    header.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Yu Gothic" };
      cell.border = THIN_BORDER;
      cell.alignment = { wrapText: true, vertical: "middle" };
    });
    for (const row of table.rows) {
      const excelRow = sheet.addRow(row);
      excelRow.eachCell((cell) => {
        cell.border = THIN_BORDER;
        cell.alignment = { wrapText: true };
        cell.font = { name: "Yu Gothic", size: 11 };
      });
    }
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    if (table.headers.length > 0) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: {
          row: Math.max(1, table.rows.length + 1),
          column: table.headers.length,
        },
      };
    }
    for (let col = 1; col <= table.headers.length; col += 1) {
      const column = sheet.getColumn(col);
      let max = 10;
      column.eachCell({ includeEmpty: false }, (cell) => {
        max = Math.min(48, Math.max(max, String(cell.value ?? "").length + 2));
      });
      column.width = max;
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export class XlsxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "xlsx" as const;

  async generate(
    content: string,
    baseFileName: string,
  ): Promise<GeneratedDeliverableFile> {
    const fromJson = extractJsonAnalysis(content);
    if (fromJson) {
      const buffer = await analysisToXlsxBuffer(fromJson);
      return createDeliverableFile(
        "xlsx",
        suggestAnalysisFileBaseName(fromJson) || baseFileName,
        buffer,
        false,
      );
    }

    const fromTables = await workbookFromMarkdownTables(content);
    if (fromTables) {
      return createDeliverableFile("xlsx", baseFileName, fromTables, false);
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("データ");
    sheet.addRow(["結果", "表データが見つかりませんでした"]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return createDeliverableFile("xlsx", baseFileName, buffer, false);
  }
}

/** Generate xlsx directly from structured image analysis (preferred path). */
export async function generateXlsxFromImageAnalysis(
  analysis: ImageAnalysisResult,
  baseFileName?: string,
): Promise<GeneratedDeliverableFile> {
  const buffer = await analysisToXlsxBuffer(analysis);
  return createDeliverableFile(
    "xlsx",
    baseFileName || suggestAnalysisFileBaseName(analysis),
    buffer,
    false,
  );
}

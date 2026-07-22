import "server-only";

import ExcelJS from "exceljs";

import { parseDeliverableContent } from "../parse-content";
import type { ContentBlock, ParsedDeliverable, ParsedSection } from "../parse-content";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";

import { createDeliverableFile } from "./shared";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E79" },
};
const ZEBRA_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF7F9FC" },
};
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB0B8C4" } },
  left: { style: "thin", color: { argb: "FFB0B8C4" } },
  bottom: { style: "thin", color: { argb: "FFB0B8C4" } },
  right: { style: "thin", color: { argb: "FFB0B8C4" } },
};

const MERGE_MARKER = /^(?:@@|«)$/;
const DATE_PATTERN = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;
const NUMBER_PATTERN = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?%?$/;

type SheetTable = {
  name: string;
  headers: string[];
  rows: string[][];
};

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, "").trim().slice(0, 28);
  return cleaned || `Sheet${index + 1}`;
}

function isMergeContinuation(value: string): boolean {
  return MERGE_MARKER.test(value.trim());
}

function parseNumeric(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  if (trimmed.endsWith("%")) {
    const n = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : null;
  }
  if (!NUMBER_PATTERN.test(value.trim()) && !/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseDate(value: string): Date | null {
  const match = value.trim().match(DATE_PATTERN);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function collectTables(parsed: ParsedDeliverable): SheetTable[] {
  const tables: SheetTable[] = [];

  for (const section of parsed.sections) {
    const sectionTables = section.blocks.filter(
      (block): block is Extract<ContentBlock, { type: "table" }> =>
        block.type === "table",
    );

    if (sectionTables.length === 0) continue;

    sectionTables.forEach((table, tableIndex) => {
      const suffix = sectionTables.length > 1 ? ` ${tableIndex + 1}` : "";
      tables.push({
        name: sanitizeSheetName(`${section.title}${suffix}`, tables.length),
        headers: table.headers,
        rows: table.rows,
      });
    });
  }

  return tables;
}

function applyAutoWidth(sheet: ExcelJS.Worksheet, columnCount: number): void {
  for (let col = 1; col <= columnCount; col += 1) {
    const column = sheet.getColumn(col);
    let max = 8;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const text = String(cell.value ?? "");
      max = Math.min(48, Math.max(max, text.length + 2));
    });
    column.width = max;
  }
}

function writeTableSheet(
  workbook: ExcelJS.Workbook,
  table: SheetTable,
): void {
  const sheet = workbook.addWorksheet(table.name);
  const columnCount = Math.max(table.headers.length, 1);

  const headerRow = sheet.addRow(table.headers);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Yu Gothic" };
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  table.rows.forEach((row, rowIndex) => {
    const values = Array.from({ length: columnCount }, (_, i) => row[i] ?? "");
    const excelRow = sheet.addRow(values.map(() => null));

    let col = 1;
    while (col <= columnCount) {
      const raw = values[col - 1] ?? "";
      const cell = excelRow.getCell(col);
      cell.border = THIN_BORDER;
      cell.font = { name: "Yu Gothic", size: 11 };
      if (rowIndex % 2 === 1) cell.fill = ZEBRA_FILL;

      if (isMergeContinuation(raw)) {
        cell.value = "";
        col += 1;
        continue;
      }

      // Merge consecutive @@ / empty-marked continuations
      let span = 1;
      while (
        col + span <= columnCount &&
        isMergeContinuation(values[col + span - 1] ?? "")
      ) {
        span += 1;
      }

      if (raw.trim().startsWith("=")) {
        cell.value = { formula: raw.trim().replace(/^=/, "") };
      } else {
        const date = parseDate(raw);
        const num = parseNumeric(raw);
        if (date) {
          cell.value = date;
          cell.numFmt = "yyyy/mm/dd";
        } else if (num !== null && raw.trim().endsWith("%")) {
          cell.value = num;
          cell.numFmt = "0.0%";
        } else if (num !== null) {
          cell.value = num;
          cell.numFmt = Number.isInteger(num) ? "#,##0" : "#,##0.00";
        } else {
          cell.value = raw;
        }
      }

      if (span > 1) {
        sheet.mergeCells(excelRow.number, col, excelRow.number, col + span - 1);
      }

      col += span;
    }
  });

  // Simple SUM formula row when numeric columns exist
  const numericCols: number[] = [];
  for (let col = 1; col <= columnCount; col += 1) {
    let numericCount = 0;
    for (let r = 2; r <= table.rows.length + 1; r += 1) {
      const cell = sheet.getRow(r).getCell(col);
      if (typeof cell.value === "number") numericCount += 1;
    }
    if (numericCount >= Math.max(1, Math.floor(table.rows.length / 2))) {
      numericCols.push(col);
    }
  }

  if (numericCols.length > 0 && table.rows.length >= 2) {
    const totalRow = sheet.addRow(Array.from({ length: columnCount }, () => ""));
    totalRow.getCell(1).value = "合計";
    totalRow.getCell(1).font = { bold: true, name: "Yu Gothic" };
    totalRow.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE8EEF5" },
      };
    });

    const firstData = 2;
    const lastData = table.rows.length + 1;
    for (const col of numericCols) {
      const letter = sheet.getColumn(col).letter;
      totalRow.getCell(col).value = {
        formula: `SUM(${letter}${firstData}:${letter}${lastData})`,
      };
      totalRow.getCell(col).numFmt = "#,##0.00";
      totalRow.getCell(col).font = { bold: true, name: "Yu Gothic" };
    }
  }

  applyAutoWidth(sheet, columnCount);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function writeOverviewSheet(
  workbook: ExcelJS.Workbook,
  parsed: ParsedDeliverable,
): void {
  const sheet = workbook.addWorksheet("概要");
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 72;

  const titleRow = sheet.addRow(["タイトル", parsed.title]);
  titleRow.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Yu Gothic" };
  titleRow.getCell(1).fill = HEADER_FILL;
  titleRow.getCell(2).font = { name: "Yu Gothic", bold: true };
  titleRow.eachCell((cell) => {
    cell.border = THIN_BORDER;
  });

  if (parsed.subtitle) {
    const sub = sheet.addRow(["サブタイトル", parsed.subtitle]);
    sub.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.font = { name: "Yu Gothic" };
    });
  }

  sheet.addRow([]);

  for (const section of parsed.sections) {
    const heading = sheet.addRow([section.title, ""]);
    sheet.mergeCells(heading.number, 1, heading.number, 2);
    heading.getCell(1).font = {
      bold: true,
      color: { argb: "FF1F4E79" },
      name: "Yu Gothic",
      size: 12,
    };

    for (const block of section.blocks) {
      if (block.type === "table") continue;
      if (block.type === "paragraph") {
        const row = sheet.addRow(["本文", block.text]);
        row.getCell(2).alignment = { wrapText: true };
        row.eachCell((cell) => {
          cell.border = THIN_BORDER;
          cell.font = { name: "Yu Gothic" };
        });
      } else if (block.type === "bulletList" || block.type === "numberedList") {
        block.items.forEach((item, index) => {
          const label =
            block.type === "numberedList" ? `${index + 1}.` : "・";
          const row = sheet.addRow([label, item]);
          row.eachCell((cell) => {
            cell.border = THIN_BORDER;
            cell.font = { name: "Yu Gothic" };
          });
        });
      }
    }
  }
}

function sectionHasNonTableContent(section: ParsedSection): boolean {
  return section.blocks.some((block) => block.type !== "table");
}

async function buildXlsxBuffer(content: string): Promise<Buffer> {
  const parsed = parseDeliverableContent(content);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MINERVOT";
  workbook.created = new Date();
  workbook.title = parsed.title;

  const tables = collectTables(parsed);
  const needsOverview =
    tables.length === 0 ||
    parsed.sections.some(sectionHasNonTableContent) ||
    Boolean(parsed.subtitle);

  if (needsOverview) {
    writeOverviewSheet(workbook, parsed);
  }

  if (tables.length === 0) {
    // Fallback single data sheet from section titles
    writeTableSheet(workbook, {
      name: "データ",
      headers: ["項目", "内容"],
      rows: parsed.sections.map((section) => [
        section.title,
        section.blocks
          .map((block) => {
            if (block.type === "paragraph") return block.text;
            if (block.type === "bulletList" || block.type === "numberedList") {
              return block.items.join(" / ");
            }
            return "";
          })
          .filter(Boolean)
          .join("\n"),
      ]),
    });
  } else {
    const usedNames = new Set<string>();
    for (const table of tables) {
      let name = table.name;
      let suffix = 2;
      while (usedNames.has(name.toLowerCase())) {
        name = `${table.name.slice(0, 26)}_${suffix}`;
        suffix += 1;
      }
      usedNames.add(name.toLowerCase());
      writeTableSheet(workbook, { ...table, name });
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** Production Excel (.xlsx) generator using ExcelJS. */
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

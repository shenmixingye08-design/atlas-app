/**
 * Extract structured spreadsheet sheets from deliverable text.
 * Prefers JSON table payloads, then markdown pipe-tables — never re-invokes AI.
 */

import { parseDeliverableContent } from "./parse-content";
import type { ContentBlock } from "./parse-content";

export type ExcelSheetData = {
  name: string;
  headers: string[];
  rows: Array<Array<string | number | Date | null>>;
};

const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const SLASH_DATE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;
const NUMBER_PATTERN = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/;

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name
    .replace(/[\\/?*\[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

function uniqueSheetNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name, index) => {
    const base = sanitizeSheetName(name, index);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (count === 0) return base;
    const suffix = `_${count + 1}`;
    return `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
  });
}

/** Coerce cell text into number / Date when safe; keep Japanese strings intact. */
export function coerceExcelCellValue(
  raw: string,
): string | number | Date | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (NUMBER_PATTERN.test(trimmed)) {
    const numeric = Number(trimmed.replace(/,/g, ""));
    if (Number.isFinite(numeric)) return numeric;
  }

  const iso = trimmed.match(ISO_DATE) ?? trimmed.match(SLASH_DATE);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
  }

  return trimmed;
}

function normalizeRow(
  cells: unknown[],
  columnCount: number,
): Array<string | number | Date | null> {
  return Array.from({ length: columnCount }, (_, index) => {
    const value = cells[index];
    if (value == null) return null;
    if (value instanceof Date) return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return coerceExcelCellValue(String(value));
  });
}

function sheetFromHeadersRows(
  name: string,
  headers: unknown,
  rows: unknown,
): ExcelSheetData | null {
  if (!Array.isArray(headers) || headers.length === 0) return null;
  const headerTexts = headers.map((h) => String(h ?? "").trim() || "列");
  const columnCount = headerTexts.length;
  const body = Array.isArray(rows) ? rows : [];
  const normalizedRows = body
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => normalizeRow(row, columnCount));

  return {
    name,
    headers: headerTexts,
    rows: normalizedRows,
  };
}

function tryParseJsonTables(content: string): ExcelSheetData[] {
  const candidates: string[] = [];

  const fenced = content.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of fenced) {
    if (match[1]?.trim()) candidates.push(match[1].trim());
  }

  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    candidates.push(trimmed);
  }

  const sheets: ExcelSheetData[] = [];

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);

      if (Array.isArray(parsed)) {
        if (
          parsed.length > 0 &&
          parsed.every(
            (row) => row && typeof row === "object" && !Array.isArray(row),
          )
        ) {
          const records = parsed as Record<string, unknown>[];
          const headers = Array.from(
            new Set(records.flatMap((row) => Object.keys(row))),
          );
          const rows = records.map((row) => headers.map((key) => row[key]));
          const sheet = sheetFromHeadersRows("Data", headers, rows);
          if (sheet) sheets.push(sheet);
          continue;
        }
      }

      if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;

        if (Array.isArray(record.sheets)) {
          for (const [index, entry] of record.sheets.entries()) {
            if (!entry || typeof entry !== "object") continue;
            const sheetRec = entry as Record<string, unknown>;
            const sheet = sheetFromHeadersRows(
              String(sheetRec.name ?? `Sheet${index + 1}`),
              sheetRec.headers,
              sheetRec.rows ?? sheetRec.data,
            );
            if (sheet) sheets.push(sheet);
          }
          continue;
        }

        if (record.headers || record.rows || record.data) {
          const sheet = sheetFromHeadersRows(
            String(record.name ?? record.title ?? "Data"),
            record.headers,
            record.rows ?? record.data,
          );
          if (sheet) sheets.push(sheet);
          continue;
        }

        if (Array.isArray(record.table)) {
          const table = record.table as unknown[];
          if (
            table.length > 0 &&
            Array.isArray(table[0]) &&
            (table[0] as unknown[]).every((c) => typeof c === "string")
          ) {
            const headers = table[0] as string[];
            const rows = table.slice(1);
            const sheet = sheetFromHeadersRows(
              String(record.name ?? "Data"),
              headers,
              rows,
            );
            if (sheet) sheets.push(sheet);
          }
        }
      }
    } catch {
      // not JSON — fall through to markdown tables
    }
  }

  return sheets;
}

function collectMarkdownTables(content: string): ExcelSheetData[] {
  const parsed = parseDeliverableContent(content);
  const sheets: ExcelSheetData[] = [];
  let tableIndex = 0;

  for (const section of parsed.sections) {
    for (const block of section.blocks) {
      if (block.type !== "table") continue;
      tableIndex += 1;
      const name =
        parsed.sections.length > 1 || tableIndex > 1
          ? section.title || `Table${tableIndex}`
          : parsed.title || section.title || "Data";
      const sheet = sheetFromHeadersRows(name, block.headers, block.rows);
      if (sheet) sheets.push(sheet);
    }
  }

  return sheets;
}

function fallbackSheetFromText(content: string): ExcelSheetData {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 500);

  return {
    name: "Data",
    headers: ["内容"],
    rows: lines.map((line) => [coerceExcelCellValue(line)]),
  };
}

/** Collect every table-shaped block (for tests / callers). */
export function extractTableBlocks(content: string): ContentBlock[] {
  const parsed = parseDeliverableContent(content);
  return parsed.sections.flatMap((section) =>
    section.blocks.filter((block) => block.type === "table"),
  );
}

/**
 * Build one or more sheets from structured JSON or markdown tables.
 * Falls back to a single-column text sheet so Excel export never fails empty.
 */
export function extractExcelSheets(content: string): ExcelSheetData[] {
  const fromJson = tryParseJsonTables(content);
  if (fromJson.length > 0) {
    const names = uniqueSheetNames(fromJson.map((sheet) => sheet.name));
    return fromJson.map((sheet, index) => ({ ...sheet, name: names[index]! }));
  }

  const fromMarkdown = collectMarkdownTables(content);
  if (fromMarkdown.length > 0) {
    const names = uniqueSheetNames(fromMarkdown.map((sheet) => sheet.name));
    return fromMarkdown.map((sheet, index) => ({
      ...sheet,
      name: names[index]!,
    }));
  }

  return [fallbackSheetFromText(content)];
}

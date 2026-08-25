import "server-only";

import ExcelJS from "exceljs";

import { neutralizeSpreadsheetCell } from "@/lib/security/spreadsheet-formula";

import { parseCsvText, parseSpreadsheetRows } from "./parse-input";
import type { ParsedBatchLines } from "./parse-input";

const MAX_PARSE_BYTES = 2 * 1024 * 1024;
const MAX_SHEET_ROWS = 40;

function cellDisplay(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if ("result" in value && (value as { result?: unknown }).result != null) {
      return String((value as { result?: unknown }).result);
    }
    if ("text" in value && (value as { text?: unknown }).text != null) {
      return String((value as { text?: unknown }).text);
    }
    if ("richText" in value) {
      return ((value as { richText?: Array<{ text?: string }> }).richText ?? [])
        .map((part) => part.text ?? "")
        .join("");
    }
    if ("hyperlink" in value) {
      return String((value as { text?: string }).text ?? "");
    }
    return "";
  }
  return "";
}

export async function parseSpreadsheetFile(input: {
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
}): Promise<
  | { ok: true; rows: Array<Record<string, string>>; headers: string[]; parsed: ParsedBatchLines }
  | { ok: false; error: string }
> {
  if (input.buffer.byteLength <= 0 || input.buffer.byteLength > MAX_PARSE_BYTES) {
    return { ok: false, error: "ファイルサイズを確認してください。" };
  }
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const mime = (input.mimeType ?? "").toLowerCase();
  let rows: Array<Record<string, string>> = [];

  if (ext === "csv" || mime.includes("csv") || ext === "txt") {
    rows = parseCsvText(input.buffer.toString("utf8"));
  } else if (ext === "xlsx" || mime.includes("spreadsheetml")) {
    rows = await readExcelRows(input.buffer);
  } else if (ext === "xls" || mime.includes("ms-excel")) {
    return { ok: false, error: "旧形式の .xls は使えません。.xlsx または CSV でお願いします。" };
  } else {
    return { ok: false, error: "CSV または Excel（.xlsx）をご指定ください。" };
  }

  if (rows.length === 0) {
    return { ok: false, error: "読み取れる行がありません。" };
  }
  const headers = Object.keys(rows[0] ?? {});
  const parsed = parseSpreadsheetRows(rows);
  return { ok: true, rows, headers, parsed };
}

async function readExcelRows(buffer: Buffer): Promise<Array<Record<string, string>>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headers: string[] = [];
  const rows: Array<Record<string, string>> = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > MAX_SHEET_ROWS) return;
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    const cells = values.map((cell) => {
      const raw = cellDisplay(cell as ExcelJS.CellValue);
      return String(neutralizeSpreadsheetCell(raw) ?? "").replace(/^'/, "");
    });
    if (rowNumber === 1) {
      cells.forEach((cell, index) => {
        headers[index] = cell.trim() || `列${index + 1}`;
      });
      return;
    }
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    if (Object.values(record).some((value) => value.trim())) {
      rows.push(record);
    }
  });
  return rows;
}

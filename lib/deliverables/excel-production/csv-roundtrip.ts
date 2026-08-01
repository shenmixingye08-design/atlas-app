import ExcelJS from "exceljs";

import { extractExcelSheets } from "@/lib/deliverables/excel-data";

export type CsvRoundtripResult = {
  ok: boolean;
  reasons: string[];
  originalRows: string[][];
  reloadedRows: string[][];
};

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function sheetsToCsv(headers: string[], rows: string[][]): string {
  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) =>
      headers.map((_, i) => escapeCsvCell(row[i] ?? "")).join(","),
    ),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]!;
    if (inQuotes) {
      if (ch === '"' && normalized[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(current);
      current = "";
      continue;
    }
    if (ch === "\n") {
      row.push(current);
      current = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    current += ch;
  }
  row.push(current);
  if (row.some((cell) => cell.length > 0)) rows.push(row);

  if (rows.length === 0) return { headers: [], rows: [] };
  const [header, ...body] = rows;
  return { headers: header ?? [], rows: body };
}

function cellToText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if ("formula" in value) {
      const withResult = value as { formula: string; result?: unknown };
      if (withResult.result != null && typeof withResult.result !== "object") {
        return String(withResult.result);
      }
      return ""; // skip unevaluated formula cells in round-trip compare
    }
    if ("richText" in value && Array.isArray((value as { richText: unknown }).richText)) {
      return cell.text || "";
    }
    if ("text" in value && typeof (value as { text: unknown }).text === "string") {
      return (value as { text: string }).text;
    }
    if ("error" in value) return String((value as { error: string }).error);
  }
  return cell.text || "";
}

/**
 * CSV → Excel → CSV round-trip integrity check for a markdown/csv content source.
 */
export async function verifyCsvExcelRoundtrip(
  content: string,
  generateXlsx: (content: string) => Promise<Buffer>,
): Promise<CsvRoundtripResult> {
  const reasons: string[] = [];
  const sheets = extractExcelSheets(content);
  const primary = sheets[0];
  if (!primary) {
    return { ok: false, reasons: ["no_sheet"], originalRows: [], reloadedRows: [] };
  }

  const csv = sheetsToCsv(primary.headers, primary.rows);
  const parsed = parseCsv(csv);
  const xlsx = await generateXlsx(csv.replace(/^\uFEFF/, ""));

  const workbook = new ExcelJS.Workbook();
  // exceljs accepts Node Buffer at runtime; cast keeps typings satisfied across versions.
  await workbook.xlsx.load(
    xlsx as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      ok: false,
      reasons: ["xlsx_no_sheet"],
      originalRows: parsed.rows,
      reloadedRows: [],
    };
  }

  const reloadedHeaders: string[] = [];
  const headerRow = sheet.getRow(1);
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    reloadedHeaders[col - 1] = cellToText(cell);
  });

  const reloadedRows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const first = cellToText(row.getCell(1));
    if (first === "合計") return; // production total formula row
    const cells: string[] = [];
    for (
      let c = 1;
      c <= Math.max(reloadedHeaders.length, parsed.headers.length);
      c += 1
    ) {
      cells.push(cellToText(row.getCell(c)));
    }
    reloadedRows.push(cells);
  });

  const outCsv = sheetsToCsv(
    reloadedHeaders.filter((h) => h != null),
    reloadedRows,
  );
  const outParsed = parseCsv(outCsv);

  if (outParsed.rows.length !== parsed.rows.length) {
    reasons.push(
      `row_count_mismatch:${parsed.rows.length}->${outParsed.rows.length}`,
    );
  }

  for (let r = 0; r < parsed.rows.length; r += 1) {
    const left = parsed.rows[r] ?? [];
    const right = outParsed.rows[r] ?? [];
    for (let c = 0; c < left.length; c += 1) {
      const a = (left[c] ?? "").trim();
      const b = (right[c] ?? "").trim();
      const an = Number(a.replace(/[,¥￥円]/g, ""));
      const bn = Number(b.replace(/[,¥￥円]/g, ""));
      if (a === b) continue;
      if (Number.isFinite(an) && Number.isFinite(bn) && an === bn) continue;
      if (a && !b) reasons.push(`missing_cell:${r}:${c}`);
      else if (/[\uFFFD]/.test(b)) reasons.push(`mojibake:${r}:${c}`);
      else if (a.includes("\n") && !b.includes("\n")) {
        reasons.push(`newline_break:${r}:${c}`);
      }
    }
  }

  if (/[\uFFFD]/.test(outCsv)) reasons.push("replacement_char");

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    originalRows: parsed.rows,
    reloadedRows: outParsed.rows,
  };
}

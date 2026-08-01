import { extractExcelSheets } from "@/lib/deliverables/excel-data";

import type {
  ExcelCellKind,
  ExcelCellModel,
  ExcelColumnModel,
  ExcelSheetModel,
  ExcelWorkbookKind,
  ExcelWorkbookModel,
} from "./types";
import { buildAutoTotalRow, tableOrigin } from "./formulas";
import { headerRequiresText } from "./security";

function inferKind(header: string, values: string[]): ExcelCellKind {
  if (headerRequiresText(header)) return "text";
  const h = header.toLowerCase();
  if (/金額|単価|売上|価格|税|円|amount|price|cost|total/i.test(h)) return "currency";
  if (/率|％|%|progress|進捗/i.test(h)) return "percent";
  if (/日|date|年月/i.test(h)) return "date";
  if (/数量|数|qty|件数|時間|日数|rank|順位/i.test(h)) return "number";
  const sample = values.filter(Boolean).slice(0, 8);
  // Keep leading-zero codes as text
  if (sample.some((v) => /^0\d+$/.test(v.trim()))) return "text";
  if (
    sample.length > 0 &&
    sample.every((v) => /^-?[\d,]+(\.\d+)?$/.test(v.replace(/[¥￥円\s]/g, "")))
  ) {
    return /¥|円/.test(sample.join("")) ? "currency" : "number";
  }
  return "text";
}

function parseCell(value: string, kind: ExcelCellKind): ExcelCellModel {
  const trimmed = value.trim();
  if (!trimmed) return { value: "", kind };
  if (kind === "number" || kind === "currency" || kind === "percent") {
    const numeric = Number(trimmed.replace(/[,¥￥円%\s]/g, ""));
    if (Number.isFinite(numeric)) {
      return {
        value: kind === "percent" && numeric > 1 ? numeric / 100 : numeric,
        kind,
      };
    }
  }
  if (kind === "date") {
    const parsed = Date.parse(
      trimmed.replace(/\./g, "/").replace(/年|月/g, "/").replace(/日/g, ""),
    );
    if (!Number.isNaN(parsed)) return { value: new Date(parsed), kind };
  }
  return { value: trimmed, kind: "text" };
}

export function workbookFromMatrix(input: {
  kind: ExcelWorkbookKind;
  title: string;
  sheetName?: string;
  headers: string[];
  rows: string[][];
  includeTotal?: boolean;
  withChart?: boolean;
}): ExcelWorkbookModel {
  const headers =
    input.headers.length > 0 ? input.headers : ["列1", "列2", "列3"];
  const columns: ExcelColumnModel[] = headers.map((header, index) => {
    const values = input.rows.map((row) => row[index] ?? "");
    return {
      key: `c${index}_${header}`,
      header: header || `列${index + 1}`,
      kind: inferKind(header, values),
    };
  });

  let rows: ExcelCellModel[][] = input.rows.map((row) =>
    columns.map((column, index) => parseCell(row[index] ?? "", column.kind)),
  );

  const sheet: ExcelSheetModel = {
    name: (input.sheetName ?? "データ").slice(0, 31),
    title: input.title,
    columns,
    rows,
    asTable: true,
    freezeHeader: true,
  };

  if (input.includeTotal !== false) {
    const origin = tableOrigin(true);
    const last = origin.firstDataRow + Math.max(rows.length, 1) - 1;
    if (rows.length > 0 && columns.some((c) => c.kind === "currency" || c.kind === "number")) {
      const total = buildAutoTotalRow({
        columns,
        firstDataRow: origin.firstDataRow,
        lastDataRow: last,
      });
      rows = [...rows, total];
      sheet.rows = rows;
    }
  }

  if (input.withChart && columns.some((c) => c.kind === "currency")) {
    sheet.charts = [
      {
        type: "column",
        title: input.title,
        categoriesRange: "A3:A10",
        series: [{ name: "値", valuesRange: "B3:B10" }],
        anchor: "H2",
      },
    ];
  }

  return {
    kind: input.kind,
    title: input.title,
    sheets: [sheet],
  };
}

/** Parse CSV text (comma / tab) into a workbook. */
export function workbookFromCsv(input: {
  csvText: string;
  title?: string;
}): ExcelWorkbookModel {
  const lines = input.csvText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return workbookFromMatrix({
      kind: "from_csv",
      title: input.title ?? "CSV変換",
      headers: ["項目"],
      rows: [],
    });
  }
  const delimiter = lines[0]!.includes("\t")
    ? "\t"
    : lines[0]!.includes(";")
      ? ";"
      : ",";
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === delimiter && !inQuotes) {
        cells.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current);
    return cells.map((c) => c.trim());
  };

  const headers = parseLine(lines[0]!);
  const rows = lines.slice(1).map(parseLine);
  return workbookFromMatrix({
    kind: "from_csv",
    title: input.title ?? "CSV変換",
    sheetName: "CSV",
    headers,
    rows,
    includeTotal: true,
    withChart: false,
  });
}

export function workbookFromMarkdownTables(input: {
  markdown: string;
  title?: string;
  kind?: ExcelWorkbookKind;
}): ExcelWorkbookModel {
  const sheets = extractExcelSheets(input.markdown);
  if (sheets.length === 0) {
    return workbookFromMatrix({
      kind: input.kind ?? "generic_table",
      title: input.title ?? "表",
      headers: ["項目", "内容"],
      rows: [],
    });
  }
  const models = sheets.map((sheet, index) =>
    workbookFromMatrix({
      kind: input.kind ?? "generic_table",
      title: index === 0 ? (input.title ?? sheet.name) : sheet.name,
      sheetName: sheet.name,
      headers: sheet.headers,
      rows: sheet.rows,
      includeTotal: true,
    }),
  );
  return {
    kind: input.kind ?? "generic_table",
    title: input.title ?? models[0]!.title,
    sheets: models.flatMap((m) => m.sheets),
  };
}

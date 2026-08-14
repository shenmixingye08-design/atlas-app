import { parseDeliverableContent } from "./parse-content";
import {
  inferColumnKind,
  isReviewPlaceholder,
  REVIEW_PLACEHOLDER,
  type ExcelColumnKind,
} from "./excel-workbook/column-types";

export type ExcelSheetData = {
  name: string;
  headers: string[];
  rows: string[][];
  /** Optional explicit types from structured JSON / vision. */
  kinds?: ExcelColumnKind[];
};

const CONFIDENCE_REVIEW_THRESHOLD = 0.6;

const TABLE_SEPARATOR_PATTERN = /^\|?[\s:-]+\|[\s|:-]+$/;

const EXCEL_KEYWORDS =
  /excel|\.xlsx|エクセル|表計算|スプレッドシート|spreadsheet|一覧表|家計簿|経費精算/i;

const IMAGE_KEYWORDS =
  /画像|写真|スクショ|スクリーンショット|レシート|領収|名刺|現場写真|image|photo|screenshot|添付/i;

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name
    .replace(/[\\/?*[\]:]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

function uniquifySheetNames(sheets: ExcelSheetData[]): ExcelSheetData[] {
  const used = new Set<string>();
  return sheets.map((sheet, index) => {
    let name = sanitizeSheetName(sheet.name, index);
    if (used.has(name)) {
      const suffix = ` (${index + 1})`;
      name = `${name.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    }
    used.add(name);
    return { ...sheet, name };
  });
}

function normalizeRow(cells: string[], width: number): string[] {
  const next = cells.map((cell) => cell.trim());
  while (next.length < width) next.push("");
  return next.slice(0, width);
}

/** True when the assignment asks for Excel / spreadsheet output. */
export function assignmentRequestsExcel(assignment: string): boolean {
  return EXCEL_KEYWORDS.test(assignment);
}

/** Image → Excel style requests (must always expose the Excel download). */
export function assignmentIsImageToExcel(assignment: string): boolean {
  return (
    assignmentRequestsExcel(assignment) && IMAGE_KEYWORDS.test(assignment)
  );
}

export function contentHasMarkdownTable(content: string): boolean {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let sawRow = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.includes("|")) {
      sawRow = false;
      continue;
    }
    if (/^\|?[\s:-]+\|[\s|:-]+$/.test(trimmed)) {
      if (sawRow) return true;
      continue;
    }
    if (trimmed.split("|").filter((part) => part.trim()).length >= 2) {
      sawRow = true;
    }
  }
  return false;
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Extract markdown pipe-tables directly (more reliable than block parsing,
 * which can split on separator rows).
 */
function extractMarkdownTables(content: string): ExcelSheetData[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sheets: ExcelSheetData[] = [];
  let index = 0;
  let lastHeading = "データ";

  while (index < lines.length) {
    const trimmed = lines[index]?.trim() ?? "";
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      lastHeading = heading[2]!.trim();
      index += 1;
      continue;
    }

    const looksLikeRow =
      trimmed.includes("|") && !TABLE_SEPARATOR_PATTERN.test(trimmed);
    const next = lines[index + 1]?.trim() ?? "";
    const nextIsSeparator = TABLE_SEPARATOR_PATTERN.test(next);

    if (looksLikeRow && nextIsSeparator) {
      const headers = parseTableRow(trimmed);
      index += 2; // skip header + separator
      const rows: string[][] = [];
      while (index < lines.length) {
        const rowLine = lines[index]?.trim() ?? "";
        if (!rowLine.includes("|") || TABLE_SEPARATOR_PATTERN.test(rowLine)) {
          break;
        }
        rows.push(parseTableRow(rowLine));
        index += 1;
      }
      const width = Math.max(
        headers.length,
        ...rows.map((row) => row.length),
        1,
      );
      sheets.push({
        name: lastHeading,
        headers: normalizeRow(headers, width),
        rows: rows.map((row) => normalizeRow(row, width)),
      });
      continue;
    }

    index += 1;
  }

  return sheets;
}

function extractCsvLikeSheet(content: string): ExcelSheetData | null {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  const delimited = lines.filter(
    (line) => line.includes("\t") || (line.includes(",") && !line.includes("|")),
  );
  if (delimited.length < 2) return null;

  const delimiter = delimited[0]!.includes("\t") ? "\t" : ",";
  const rows = delimited.map((line) =>
    line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, "")),
  );
  const width = Math.max(...rows.map((row) => row.length), 1);
  const [header, ...body] = rows;
  return {
    name: "データ",
    headers: normalizeRow(header ?? [], width),
    rows: body.map((row) => normalizeRow(row, width)),
  };
}

function buildFallbackSheet(content: string): ExcelSheetData {
  const parsed = parseDeliverableContent(content);
  const rows: string[][] = [];

  if (parsed.title) {
    rows.push(["タイトル", parsed.title]);
  }
  if (parsed.subtitle) {
    rows.push(["サブタイトル", parsed.subtitle]);
  }

  for (const section of parsed.sections) {
    rows.push(["見出し", section.title]);
    for (const block of section.blocks) {
      if (block.type === "paragraph" && block.text.trim()) {
        rows.push(["本文", block.text.trim()]);
      } else if (block.type === "bulletList" || block.type === "numberedList") {
        for (const item of block.items) {
          rows.push([section.title, item]);
        }
      }
    }
  }

  if (rows.length === 0) {
    const plain = content.trim() || "（データなし）";
    rows.push(["内容", plain]);
  }

  return {
    name: "データ",
    headers: ["項目", "内容"],
    rows,
  };
}

function dropEmptyColumns(sheet: ExcelSheetData): ExcelSheetData {
  const width = Math.max(
    sheet.headers.length,
    ...sheet.rows.map((row) => row.length),
    0,
  );
  if (width === 0) return sheet;
  const keep: number[] = [];
  for (let col = 0; col < width; col += 1) {
    const header = (sheet.headers[col] ?? "").trim();
    const hasValue = sheet.rows.some((row) => String(row[col] ?? "").trim());
    if (header || hasValue) keep.push(col);
  }
  if (keep.length === 0 || keep.length === width) {
    return {
      ...sheet,
      headers: normalizeRow(sheet.headers, width || 1),
      rows: sheet.rows.map((row) => normalizeRow(row, width || 1)),
    };
  }
  return {
    ...sheet,
    headers: keep.map((i) => sheet.headers[i] ?? ""),
    rows: sheet.rows.map((row) => keep.map((i) => row[i] ?? "")),
    kinds: sheet.kinds ? keep.map((i) => sheet.kinds![i] ?? "text") : undefined,
  };
}

function parseDeclaredKind(raw: unknown): ExcelColumnKind | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!value) return null;
  if (/currency|money|amount|yen|jpy|usd/.test(value)) return "currency";
  if (/percent|percentage|rate|ratio/.test(value)) return "percentage";
  if (/^date|datetime|day/.test(value)) return "date";
  if (/^time/.test(value)) return "time";
  if (/number|numeric|qty|quantity|count/.test(value)) return "number";
  if (/text|string|label/.test(value)) return "text";
  return null;
}

function applyConfidence(
  rows: string[][],
  confidence: unknown,
): string[][] {
  if (!Array.isArray(confidence)) return rows;
  return rows.map((row, rowIdx) => {
    const rowConf = confidence[rowIdx];
    return row.map((cell, colIdx) => {
      if (isReviewPlaceholder(cell)) return REVIEW_PLACEHOLDER;
      const cellConf = Array.isArray(rowConf) ? rowConf[colIdx] : rowConf;
      if (typeof cellConf === "number" && cellConf < CONFIDENCE_REVIEW_THRESHOLD) {
        return REVIEW_PLACEHOLDER;
      }
      return cell;
    });
  });
}

function extractJsonSheets(content: string): ExcelSheetData[] {
  const fence = content.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fence?.[1]?.trim() || content.trim();
  if (!candidate.startsWith("{") && !candidate.startsWith("[")) return [];
  try {
    const parsed = JSON.parse(candidate) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { sheets?: unknown }).sheets)
        ? (parsed as { sheets: unknown[] }).sheets
        : parsed &&
            typeof parsed === "object" &&
            (Array.isArray((parsed as { headers?: unknown }).headers) ||
              Array.isArray((parsed as { columns?: unknown }).columns))
          ? [parsed]
          : [];
    const sheets: ExcelSheetData[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const rec = item as {
        name?: unknown;
        headers?: unknown;
        columns?: unknown;
        types?: unknown;
        rows?: unknown;
        confidence?: unknown;
      };
      const columnsRaw = rec.columns;
      const headerFromColumns = Array.isArray(columnsRaw)
        ? columnsRaw.map((col) =>
            col && typeof col === "object"
              ? String(
                  (col as { name?: unknown; header?: unknown }).name ??
                    (col as { header?: unknown }).header ??
                    "",
                )
              : String(col ?? ""),
          )
        : null;
      const headersRaw = rec.headers ?? headerFromColumns;
      if (!Array.isArray(headersRaw) || !Array.isArray(rec.rows)) continue;
      const headers = headersRaw.map((h) => String(h ?? "").trim());
      const rows: string[][] = rec.rows.map((row) => {
        if (Array.isArray(row)) return row.map((c) => String(c ?? ""));
        if (row && typeof row === "object") {
          return headers.map((h) =>
            String((row as Record<string, unknown>)[h] ?? ""),
          );
        }
        return [];
      });
      const withConfidence = applyConfidence(rows, rec.confidence);
      const kindsFromColumns = Array.isArray(columnsRaw)
        ? columnsRaw.map((col) =>
            col && typeof col === "object"
              ? parseDeclaredKind((col as { type?: unknown }).type)
              : null,
          )
        : [];
      const kindsFromTypes = Array.isArray(rec.types)
        ? rec.types.map((t) => parseDeclaredKind(t))
        : [];
      const declared =
        kindsFromColumns.some(Boolean) || kindsFromTypes.some(Boolean)
          ? headers.map((_, idx) => {
              return (
                kindsFromColumns[idx] ??
                kindsFromTypes[idx] ??
                inferColumnKind(
                  headers[idx] ?? "",
                  withConfidence.map((r) => r[idx] ?? ""),
                )
              );
            })
          : undefined;
      sheets.push({
        name: String(rec.name ?? "データ"),
        headers,
        rows: withConfidence,
        kinds: declared,
      });
    }
    return sheets;
  } catch {
    return [];
  }
}

/**
 * Build one or more worksheets from AI-generated deliverable text.
 * Prefers structured JSON, then markdown tables, then CSV/TSV, then 項目/内容.
 */
export function extractExcelSheets(content: string): ExcelSheetData[] {
  const fromJson = extractJsonSheets(content);
  if (fromJson.length > 0) {
    return uniquifySheetNames(fromJson.map(dropEmptyColumns));
  }

  const fromTables = extractMarkdownTables(content);
  if (fromTables.length > 0) {
    return uniquifySheetNames(fromTables.map(dropEmptyColumns));
  }

  const csvSheet = extractCsvLikeSheet(content);
  if (csvSheet) {
    return uniquifySheetNames([dropEmptyColumns(csvSheet)]);
  }

  return uniquifySheetNames([dropEmptyColumns(buildFallbackSheet(content))]);
}

/** Whether xlsx should be generated for this assignment/content. */
export function shouldGenerateXlsx(
  assignment: string,
  content: string,
): boolean {
  return (
    assignmentRequestsExcel(assignment) ||
    assignmentIsImageToExcel(assignment) ||
    contentHasMarkdownTable(content)
  );
}

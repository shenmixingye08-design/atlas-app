import { parseDeliverableContent } from "./parse-content";

export type ExcelSheetData = {
  name: string;
  headers: string[];
  rows: string[][];
};

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
  let tableIndex = 0;
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
        name: tableIndex === 0 ? lastHeading : `${lastHeading} (${tableIndex + 1})`,
        headers: normalizeRow(headers, width),
        rows: rows.map((row) => normalizeRow(row, width)),
      });
      tableIndex += 1;
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

/**
 * Build one or more worksheets from AI-generated deliverable text.
 * Prefers markdown tables, then CSV/TSV, then a structured 項目/内容 fallback.
 */
export function extractExcelSheets(content: string): ExcelSheetData[] {
  const fromTables = extractMarkdownTables(content);
  if (fromTables.length > 0) {
    return uniquifySheetNames(fromTables);
  }

  const csvSheet = extractCsvLikeSheet(content);
  if (csvSheet) {
    return uniquifySheetNames([csvSheet]);
  }

  return uniquifySheetNames([buildFallbackSheet(content)]);
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

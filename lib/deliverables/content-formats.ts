import { parseDeliverableContent } from "./parse-content";
import type { DeliverableFormat } from "./types";

const TABLE_LINE = /^\|.+\|/;
const PRESENTATION_HINT =
  /スライド|プレゼン|pitch|deck|提案資料|営業資料|アジェンダ|タイトルスライド/i;
const SPREADSHEET_HINT =
  /売上|集計|一覧表|管理表|予算|実績|KPI|ダッシュボード|スプレッドシート|excel|CSV|表形式|数値管理/i;

/** Count markdown tables in deliverable text. */
export function countMarkdownTables(content: string): number {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  let count = 0;
  let inTable = false;

  for (const raw of lines) {
    const line = raw.trim();
    const isRow = TABLE_LINE.test(line) || (line.includes("|") && /\|/.test(line));
    if (isRow) {
      if (!inTable) {
        count += 1;
        inTable = true;
      }
    } else if (line === "" || /^#{1,3}\s/.test(line)) {
      inTable = false;
    } else {
      inTable = false;
    }
  }

  return count;
}

/** True when content is primarily tabular (good Excel/CSV candidate). */
export function looksLikeSpreadsheet(content: string): boolean {
  if (SPREADSHEET_HINT.test(content)) return true;
  const tables = countMarkdownTables(content);
  if (tables === 0) return false;

  const parsed = parseDeliverableContent(content);
  let tableCells = 0;
  let otherBlocks = 0;

  for (const section of parsed.sections) {
    for (const block of section.blocks) {
      if (block.type === "table") {
        tableCells += block.headers.length + block.rows.reduce((n, row) => n + row.length, 0);
      } else {
        otherBlocks += 1;
      }
    }
  }

  return tables >= 1 && tableCells >= 6 && tableCells >= otherBlocks * 2;
}

/** True when content reads like a presentation deck. */
export function looksLikePresentation(content: string): boolean {
  if (PRESENTATION_HINT.test(content)) return true;
  const parsed = parseDeliverableContent(content);
  const sectionCount = parsed.sections.length;
  if (sectionCount < 3) return false;

  const shortSections = parsed.sections.filter((section) => {
    const textLen = section.blocks.reduce((sum, block) => {
      if (block.type === "paragraph") return sum + block.text.length;
      if (block.type === "bulletList" || block.type === "numberedList") {
        return sum + block.items.join("").length;
      }
      return sum;
    }, 0);
    return textLen > 0 && textLen < 600;
  }).length;

  return shortSections >= 3;
}

/**
 * Enrich assignment-based formats with content signals.
 * Never removes user-selected formats; only adds deterministic conversions.
 */
export function enrichFormatsFromContent(
  formats: readonly DeliverableFormat[],
  content: string,
  assignment = "",
): DeliverableFormat[] {
  const next = new Set<DeliverableFormat>(formats);
  const haystack = `${assignment}\n${content}`;

  // Always offer text baselines for business handoff.
  next.add("md");
  next.add("txt");
  next.add("pdf");

  if (looksLikeSpreadsheet(haystack) || countMarkdownTables(content) >= 1) {
    next.add("xlsx");
    next.add("csv");
    next.add("docx");
  }

  if (looksLikePresentation(haystack)) {
    next.add("pptx");
    next.add("pdf");
  }

  // Documents / proposals → Word by default when not spreadsheet-only.
  if (!looksLikeSpreadsheet(haystack) || countMarkdownTables(content) === 0) {
    next.add("docx");
  }

  return orderFormats([...next]);
}

function orderFormats(formats: DeliverableFormat[]): DeliverableFormat[] {
  const order: DeliverableFormat[] = [
    "docx",
    "xlsx",
    "pdf",
    "pptx",
    "md",
    "txt",
    "csv",
  ];
  return order.filter((format) => formats.includes(format));
}

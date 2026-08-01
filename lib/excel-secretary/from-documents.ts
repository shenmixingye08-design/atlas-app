import "server-only";

import mammoth from "mammoth";

import { extractTextFromPdfBuffer } from "@/lib/documents/extract-pdf-text";

import { workbookFromCsv, workbookFromMarkdownTables, workbookFromMatrix } from "./from-tabular";
import type { ExcelWorkbookModel } from "./types";

function tablesFromPlainText(text: string): { headers: string[]; rows: string[][] }[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const tables: { headers: string[]; rows: string[][] }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    // Markdown table
    if (line.includes("|") && /^\|?[\s:-]+\|/.test(lines[i + 1] ?? "")) {
      const headers = line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("|")) {
        const row = (lines[i] ?? "")
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((c) => c.trim());
        if (!/^[\s:-]+$/.test(row.join(""))) rows.push(row);
        i += 1;
      }
      tables.push({ headers, rows });
      continue;
    }
    // TSV / spaced columns (≥2 tabs or many spaces)
    if (/\t/.test(line) && (lines[i + 1] ?? "").includes("\t")) {
      const headers = line.split("\t").map((c) => c.trim());
      i += 1;
      const rows: string[][] = [];
      while (i < lines.length && (lines[i] ?? "").includes("\t")) {
        rows.push((lines[i] ?? "").split("\t").map((c) => c.trim()));
        i += 1;
      }
      tables.push({ headers, rows });
      continue;
    }
    i += 1;
  }
  return tables;
}

function listsToRows(text: string): string[][] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
    .map((line, index) => [
      String(index + 1),
      line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, ""),
    ]);
}

/** PDF → Excel (table-preserving best effort from extracted text). */
export async function workbookFromPdfBuffer(input: {
  buffer: Buffer;
  title?: string;
}): Promise<ExcelWorkbookModel> {
  const text = extractTextFromPdfBuffer(input.buffer);
  const tables = tablesFromPlainText(text);
  if (tables.length > 0) {
    const sheets = tables.map((table, index) =>
      workbookFromMatrix({
        kind: "from_pdf",
        title: input.title ?? `PDF表${index + 1}`,
        sheetName: `表${index + 1}`,
        headers: table.headers,
        rows: table.rows,
        includeTotal: true,
      }),
    );
    return {
      kind: "from_pdf",
      title: input.title ?? "PDF変換",
      sheets: sheets.flatMap((w) => w.sheets),
    };
  }
  // Fallback: line dump as single column to avoid silent empty workbook
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 5000)
    .map((line) => [line]);
  return workbookFromMatrix({
    kind: "from_pdf",
    title: input.title ?? "PDF変換",
    sheetName: "抽出テキスト",
    headers: ["内容"],
    rows: lines,
    includeTotal: false,
  });
}

/** Word (.docx) → Excel from tables / lists. */
export async function workbookFromDocxBuffer(input: {
  buffer: Buffer;
  title?: string;
}): Promise<ExcelWorkbookModel> {
  const result = await mammoth.convertToHtml({ buffer: input.buffer });
  const html = result.value ?? "";
  // Prefer HTML tables
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  const htmlTables = html.match(tableRegex) ?? [];
  if (htmlTables.length > 0) {
    const sheets = htmlTables.map((tableHtml, index) => {
      const rows = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((tr) =>
        [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
          cell[1]!.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim(),
        ),
      );
      const headers = rows[0] ?? ["列1"];
      const body = rows.slice(1);
      return workbookFromMatrix({
        kind: "from_word",
        title: input.title ?? `Word表${index + 1}`,
        sheetName: `表${index + 1}`,
        headers,
        rows: body,
        includeTotal: true,
      });
    });
    return {
      kind: "from_word",
      title: input.title ?? "Word変換",
      sheets: sheets.flatMap((w) => w.sheets),
    };
  }

  const textResult = await mammoth.extractRawText({ buffer: input.buffer });
  const text = textResult.value ?? "";
  const listRows = listsToRows(text);
  if (listRows.length > 0) {
    return workbookFromMatrix({
      kind: "from_word",
      title: input.title ?? "Word変換",
      sheetName: "一覧",
      headers: ["No", "項目"],
      rows: listRows,
      includeTotal: false,
    });
  }
  return workbookFromMarkdownTables({
    markdown: text,
    title: input.title ?? "Word変換",
    kind: "from_word",
  });
}

export async function workbookFromCsvBuffer(input: {
  buffer: Buffer;
  title?: string;
}): Promise<ExcelWorkbookModel> {
  return workbookFromCsv({
    csvText: input.buffer.toString("utf8"),
    title: input.title,
  });
}

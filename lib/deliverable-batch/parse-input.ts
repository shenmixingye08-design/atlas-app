import { neutralizeSpreadsheetCell } from "@/lib/security/spreadsheet-formula";

import { sanitizeUserItemText } from "./safety";
import type { DeliverableBatchItemInput } from "./types";

export type ParsedBatchLines = {
  items: DeliverableBatchItemInput[];
  emptyDropped: number;
  duplicateWarnings: string[];
};

const COLUMN_ALIASES: Record<string, keyof DeliverableBatchItemInput> = {
  タイトル: "title",
  title: "title",
  テーマ: "theme",
  theme: "theme",
  固有指示: "instruction",
  instruction: "instruction",
  対象読者: "audience",
  audience: "audience",
  含める内容: "include",
  include: "include",
  禁止事項: "forbidden",
  forbidden: "forbidden",
  出力ファイル名: "fileName",
  filename: "fileName",
  file_name: "fileName",
};

export function parseCsvText(raw: string): Array<Record<string, string>> {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const first = splitCsvLine(lines[0] ?? "");
  const looksHeader = first.some((cell) =>
    Boolean(
      COLUMN_ALIASES[cell.trim()] || COLUMN_ALIASES[cell.trim().toLowerCase()],
    ),
  );
  if (!looksHeader) {
    return lines.map((line) => ({ タイトル: sanitizeUserItemText(line) }));
  }
  const headers = first.map((cell) => cell.trim() || "列");
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

export function parseLineList(raw: string): ParsedBatchLines {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => sanitizeUserItemText(line))
    .filter((line) => line.length > 0);
  const seen = new Map<string, number>();
  const duplicateWarnings: string[] = [];
  const items: DeliverableBatchItemInput[] = [];
  for (const line of lines) {
    const key = line.normalize("NFKC").toLowerCase();
    const prev = seen.get(key) ?? 0;
    seen.set(key, prev + 1);
    if (prev > 0) {
      duplicateWarnings.push(`「${line}」が重複しています。`);
    }
    items.push({
      title: line.slice(0, 80),
      theme: line.slice(0, 80),
      instruction: line,
    });
  }
  const emptyDropped = raw.split(/\r?\n/).length - lines.length;
  return { items, emptyDropped: Math.max(0, emptyDropped), duplicateWarnings };
}

export function resolveColumnMap(
  headers: string[],
  override?: Record<string, string>,
): Record<string, keyof DeliverableBatchItemInput> {
  const map: Record<string, keyof DeliverableBatchItemInput> = {};
  for (const header of headers) {
    const key = header.trim();
    const forced = override?.[key];
    const aliased = forced
      ? COLUMN_ALIASES[forced] ?? COLUMN_ALIASES[key.toLowerCase()]
      : COLUMN_ALIASES[key] ?? COLUMN_ALIASES[key.toLowerCase()];
    if (aliased) map[key] = aliased;
  }
  return map;
}

export function parseSpreadsheetRows(
  rows: Array<Record<string, string>>,
  columnMap?: Record<string, string>,
): ParsedBatchLines {
  if (rows.length === 0) {
    return { items: [], emptyDropped: 0, duplicateWarnings: [] };
  }
  const headers = Object.keys(rows[0] ?? {});
  const map = resolveColumnMap(headers, columnMap);
  const seen = new Map<string, number>();
  const duplicateWarnings: string[] = [];
  const items: DeliverableBatchItemInput[] = [];
  let emptyDropped = 0;

  for (const row of rows) {
    const next: DeliverableBatchItemInput = {
      title: "",
      theme: "",
      instruction: "",
    };
    for (const [header, raw] of Object.entries(row)) {
      const neutralized = String(neutralizeSpreadsheetCell(raw) ?? "");
      const safe = sanitizeUserItemText(
        neutralized.replace(/^'/, "").replace(/^[=+\-@]+/, ""),
      );
      const field = map[header];
      if (!field) continue;
      next[field] = safe;
    }
    const title = next.title || next.theme || next.instruction;
    if (!title) {
      emptyDropped += 1;
      continue;
    }
    next.title = next.title || title.slice(0, 80);
    next.theme = next.theme || next.title;
    next.instruction = next.instruction || next.title;
    const key = `${next.title}\n${next.theme}`.normalize("NFKC").toLowerCase();
    const prev = seen.get(key) ?? 0;
    seen.set(key, prev + 1);
    if (prev > 0) duplicateWarnings.push(`「${next.title}」が重複しています。`);
    items.push(next);
  }
  return { items, emptyDropped, duplicateWarnings };
}

export function parseAttachmentItems(
  attachments: Array<{ id: string; name: string; extractedText?: string }>,
): ParsedBatchLines {
  return {
    items: attachments.map((attachment) => ({
      title: attachment.name.replace(/\.[^.]+$/, "").slice(0, 80) || "添付",
      theme: attachment.name,
      instruction: sanitizeUserItemText(attachment.extractedText ?? ""),
      attachmentId: attachment.id,
      attachmentName: attachment.name,
    })),
    emptyDropped: 0,
    duplicateWarnings: [],
  };
}

import type { ExcelSheetData } from "@/lib/deliverables/excel-data";
import { extractExcelSheets } from "@/lib/deliverables/excel-data";

export type ImageFormKind =
  | "table"
  | "invoice"
  | "receipt"
  | "ledger"
  | "form";

/**
 * Classify image→Excel target from assignment / OCR-ish markdown content.
 * Does not call Vision APIs — consumes already-extracted text/tables only.
 */
export function detectImageFormKind(
  assignment: string,
  content: string,
): ImageFormKind {
  const text = `${assignment}\n${content}`;
  if (/請求書|invoice/i.test(text)) return "invoice";
  if (/領収書|receipt|レシート/i.test(text)) return "receipt";
  if (/帳票|台帳|ledger/i.test(text)) return "ledger";
  if (/\|/.test(content)) return "table";
  return "form";
}

function metaRowsFromContent(content: string): string[][] {
  const rows: string[][] = [];
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    const m =
      line.match(/^[-*]\s*\*?\*?([^:：*]{1,40})\*?\*?[:：]\s*(.+)$/) ||
      line.match(/^([^:：]{1,40})[:：]\s*(.+)$/);
    if (!m) continue;
    const key = m[1]!.trim();
    const value = m[2]!.trim();
    if (!key || !value) continue;
    if (key.startsWith("#")) continue;
    if (/^[|\-]/.test(key)) continue;
    rows.push([key, value]);
  }
  return rows.slice(0, 40);
}

/**
 * Build structured sheets for image-derived business documents.
 * Preserves table grid; adds メタ情報 sheet for key:value OCR fields.
 */
export function buildImageExcelSheets(
  assignment: string,
  content: string,
): {
  kind: ImageFormKind;
  sheets: ExcelSheetData[];
  mergeTitle: string | null;
} {
  const kind = detectImageFormKind(assignment, content);
  const tables = extractExcelSheets(content);
  const meta = metaRowsFromContent(content);

  const sheets: ExcelSheetData[] = [];

  if (kind === "invoice" || kind === "receipt") {
    const title =
      kind === "invoice" ? "請求書" : /レシート/.test(assignment + content)
        ? "レシート"
        : "領収書";
    sheets.push({
      name: "表紙",
      headers: ["項目", "内容"],
      rows: [
        ["帳票種別", title],
        ...meta.filter((row) =>
          /日付|金額|税|取引先|店舗|請求|領収|合計|登録番号|No/i.test(row[0] ?? ""),
        ),
      ],
    });
  }

  for (const table of tables) {
    if (
      table.headers.join(",") === "項目,内容" &&
      sheets.some((s) => s.name === "表紙")
    ) {
      continue;
    }
    sheets.push(table);
  }

  if (meta.length > 0 && !sheets.some((s) => s.name === "メタ情報")) {
    sheets.push({
      name: "メタ情報",
      headers: ["項目", "内容"],
      rows: meta,
    });
  }

  if (sheets.length === 0) {
    sheets.push({
      name: "データ",
      headers: ["項目", "内容"],
      rows: meta.length > 0 ? meta : [["内容", content.trim().slice(0, 2000) || "（データなし）"]],
    });
  }

  return {
    kind,
    sheets,
    mergeTitle:
      kind === "invoice"
        ? "請求書"
        : kind === "receipt"
          ? "領収書"
          : kind === "ledger"
            ? "帳票"
            : null,
  };
}

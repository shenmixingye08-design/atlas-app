import ExcelJS from "exceljs";

import {
  buildExcelJsWorkbook,
  toPreviewPayload,
  writeWorkbookBuffer,
} from "./build-workbook";
import { ExcelSecretaryError } from "./errors";
import { sanitizeCsvCell, sanitizeExcelFileName } from "./security";
import type { ExcelPreviewPayload, ExcelWorkbookModel } from "./types";

export type ExcelExportFormat = "xlsx" | "xls" | "csv" | "pdf";

export type ExcelExportResult = {
  format: ExcelExportFormat;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  warning?: string;
};

function baseName(title: string): string {
  return sanitizeExcelFileName(title);
}

/** Export workbook model to xlsx / csv / pdf. .xls is served as xlsx with warning. */
export async function exportWorkbook(
  model: ExcelWorkbookModel,
  format: ExcelExportFormat,
): Promise<ExcelExportResult> {
  const name = baseName(model.title);

  if (format === "xls") {
    // Honest unsupported: never emit a fake .xls extension.
    throw new ExcelSecretaryError(
      "download",
      "unsupported_file",
      "旧形式 .xls の書き出しは互換性リスクがあるため未対応です。.xlsx をご利用ください。",
      false,
    );
  }

  if (format === "xlsx") {
    const buffer = await writeWorkbookBuffer(model);
    return {
      format,
      fileName: `${name}.xlsx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    };
  }

  if (format === "csv") {
    const sheet = model.sheets[0];
    if (!sheet) {
      return {
        format: "csv",
        fileName: `${name}.csv`,
        mimeType: "text/csv; charset=utf-8",
        buffer: Buffer.from("\uFEFF"),
      };
    }
    const lines = [
      sheet.columns.map((c) => sanitizeCsvCell(c.header)).join(","),
      ...sheet.rows.map((row) =>
        sheet.columns
          .map((_, i) => {
            const cell = row[i];
            if (cell?.formula) {
              // Export formula result placeholder safely (prefix apostrophe).
              return sanitizeCsvCell(`=${cell.formula.replace(/^=/, "")}`);
            }
            if (cell?.value instanceof Date) {
              return sanitizeCsvCell(cell.value.toISOString().slice(0, 10));
            }
            return sanitizeCsvCell(cell?.value == null ? "" : String(cell.value));
          })
          .join(","),
      ),
    ];
    return {
      format: "csv",
      fileName: `${name}.csv`,
      mimeType: "text/csv; charset=utf-8",
      buffer: Buffer.from(`\uFEFF${lines.join("\n")}`, "utf8"),
    };
  }

  // PDF: tabular text pages via existing pdf generator pathway (lightweight).
  const { PdfDeliverableGenerator } = await import(
    "@/lib/deliverables/generators/pdf-generator"
  );
  const markdown = workbookToMarkdown(model);
  const pdf = await new PdfDeliverableGenerator().generate(markdown, name);
  return {
    format: "pdf",
    fileName: pdf.fileName,
    mimeType: pdf.mimeType,
    buffer: pdf.buffer,
  };
}

export function workbookToMarkdown(model: ExcelWorkbookModel): string {
  const parts = [`# ${model.title}`, ""];
  for (const sheet of model.sheets) {
    parts.push(`## ${sheet.name}`, "");
    parts.push(`| ${sheet.columns.map((c) => c.header).join(" | ")} |`);
    parts.push(
      `| ${sheet.columns.map(() => "---").join(" | ")} |`,
    );
    for (const row of sheet.rows) {
      parts.push(
        `| ${sheet.columns
          .map((_, i) => {
            const cell = row[i];
            if (cell?.formula) return `=${cell.formula}`;
            if (cell?.value instanceof Date) {
              return cell.value.toISOString().slice(0, 10);
            }
            return cell?.value == null ? "" : String(cell.value);
          })
          .join(" | ")} |`,
      );
    }
    parts.push("");
  }
  return parts.join("\n");
}

function cellToPreviewText(cell: unknown): string {
  if (cell == null) return "";
  if (typeof cell === "object" && cell && "result" in cell) {
    return String((cell as { result?: unknown }).result ?? "");
  }
  if (typeof cell === "object" && cell && "formula" in cell) {
    return `=${String((cell as { formula?: unknown }).formula ?? "")}`;
  }
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === "object" && cell && "richText" in cell) {
    const rich = (cell as { richText?: Array<{ text?: string }> }).richText;
    return (rich ?? []).map((part) => part.text ?? "").join("");
  }
  if (typeof cell === "object" && cell && "text" in cell) {
    return String((cell as { text?: unknown }).text ?? "");
  }
  return String(cell);
}

/** True when row 0 is a merged title (one unique value) and row 1 is the real header. */
function looksLikeTitleThenHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const first = rows[0] ?? [];
  const second = rows[1] ?? [];
  const uniqueFirst = [...new Set(first.map((v) => v.trim()).filter(Boolean))];
  if (uniqueFirst.length !== 1) return false;
  const uniqueSecond = [...new Set(second.map((v) => v.trim()).filter(Boolean))];
  // Header row should have multiple distinct labels, or more columns than title.
  return uniqueSecond.length >= 2 || second.filter(Boolean).length >= 2;
}

/** Load an uploaded xlsx into a secretary model (for edit/analyze). */
export async function workbookModelFromXlsxBuffer(
  buffer: Buffer,
  title = "アップロードExcel",
): Promise<ExcelWorkbookModel> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheets = workbook.worksheets.map((sheet) => {
    const rows: string[][] = [];
    const colCount = Math.max(sheet.columnCount || 0, 1);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      for (let c = 1; c <= Math.max(colCount, row.cellCount || 0); c += 1) {
        values.push(cellToPreviewText(row.getCell(c).value).trim());
      }
      // Trim trailing empties but keep alignment for header detection
      while (values.length > 1 && values[values.length - 1] === "") {
        values.pop();
      }
      rows.push(values);
    });

    let sheetTitle: string | null = null;
    let dataRows = rows;
    if (looksLikeTitleThenHeader(rows)) {
      sheetTitle = rows[0]?.find((v) => v.trim()) ?? null;
      dataRows = rows.slice(1);
    }

    const headers = dataRows[0] ?? ["列1"];
    const body = dataRows.slice(1);
    return {
      name: sheet.name,
      title: sheetTitle,
      columns: headers.map((header, index) => ({
        key: `c${index}`,
        header: header || `列${index + 1}`,
        kind: "text" as const,
      })),
      rows: body.map((row) =>
        headers.map((_, index) => ({
          value: row[index] ?? "",
          kind: "text" as const,
        })),
      ),
      asTable: true,
      freezeHeader: true,
    };
  });

  return {
    kind: "edited",
    title,
    sheets:
      sheets.length > 0
        ? sheets
        : [
            {
              name: "データ",
              columns: [{ key: "c0", header: "列1", kind: "text" }],
              rows: [],
            },
          ],
  };
}

export async function roundTripXlsx(model: ExcelWorkbookModel): Promise<Buffer> {
  const wb = await buildExcelJsWorkbook(model);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Preview payload from an existing xlsx/csv buffer (UI sheet switcher). */
export async function previewWorkbook(
  buffer: Buffer,
  title?: string,
): Promise<ExcelPreviewPayload> {
  try {
    const head = buffer.subarray(0, 4).toString("utf8");
    // CSV heuristic: not a ZIP (xlsx starts with PK)
    if (!head.startsWith("PK")) {
      const text = buffer.toString("utf8");
      if (text.includes(",") || text.includes("\t")) {
        const { workbookFromCsv } = await import("./from-tabular");
        const model = workbookFromCsv({
          csvText: text.replace(/^\uFEFF/, ""),
          title: title ?? "CSV",
        });
        return toPreviewPayload(model);
      }
    }
    const model = await workbookModelFromXlsxBuffer(buffer, title ?? "Excel");
    return toPreviewPayload(model);
  } catch (error) {
    throw new ExcelSecretaryError(
      "ai_analysis",
      "preview_failed",
      error instanceof Error ? error.message : "プレビューの生成に失敗しました",
      true,
    );
  }
}

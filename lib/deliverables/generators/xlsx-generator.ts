import ExcelJS from "exceljs";

import { neutralizeSpreadsheetCell } from "@/lib/security/spreadsheet-formula";

import { extractExcelSheets } from "../excel-data";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";
import { createDeliverableFile } from "./shared";

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB0B0B0" } },
  left: { style: "thin", color: { argb: "FFB0B0B0" } },
  bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
  right: { style: "thin", color: { argb: "FFB0B0B0" } },
};

/** Approximate display width for mixed Japanese / ASCII text. */
function cellDisplayWidth(value: string): number {
  let width = 0;
  for (const char of value) {
    width += char.charCodeAt(0) > 255 ? 2 : 1;
  }
  return width;
}

function autofitColumns(sheet: ExcelJS.Worksheet, columnCount: number): void {
  for (let col = 1; col <= columnCount; col += 1) {
    let max = 8;
    const column = sheet.getColumn(col);
    column.eachCell({ includeEmpty: true }, (cell) => {
      const text =
        cell.value == null
          ? ""
          : typeof cell.value === "string"
            ? cell.value
            : String(cell.value);
      max = Math.max(max, cellDisplayWidth(text));
    });
    column.width = Math.min(Math.max(max + 2, 10), 60);
  }
}

type XlsxGenerateOptions = {
  excel?: {
    headerColorArgb?: string | null;
    currency?: string | null;
    dateFormat?: string | null;
    decimalPlaces?: number | null;
    columnOrder?: string[];
  } | null;
  companyName?: string | null;
};

type ColumnKind = "currency" | "date" | "number" | "text";

function currencyNumFmt(currency: string | null | undefined): string {
  const code = (currency ?? "JPY").trim().toUpperCase();
  if (code === "USD" || code === "$") return '"$"#,##0.00';
  if (code === "EUR" || code === "€") return '"€"#,##0.00';
  // Default JPY / ¥
  return '"¥"#,##0';
}

function dateNumFmt(dateFormat: string | null | undefined): string {
  const raw = (dateFormat ?? "yyyy-mm-dd").trim().toLowerCase();
  if (raw.includes("yyyy/m/d") || raw === "ja-slash") return "yyyy/m/d";
  if (raw.includes("yyyy年")) return "yyyy年m月d日";
  if (raw.includes("mm/dd") || raw.includes("m/d/yy")) return "yyyy-mm-dd";
  return "yyyy-mm-dd";
}

function headerSuggestsCurrency(header: string): boolean {
  return /金額|価格|売上|単価|料金|費用|amount|price|cost|revenue|円|currency/i.test(
    header,
  );
}

function headerSuggestsDate(header: string): boolean {
  return /日付|日時|年月日|date|day|期間/i.test(header);
}

function headerSuggestsNumber(header: string): boolean {
  return /数量|個数|件数|qty|quantity|count|人数|率|%/i.test(header);
}

function looksNumeric(value: string): boolean {
  const cleaned = value.replace(/[,，\s¥￥円$€]/g, "");
  return /^-?\d+(\.\d+)?%?$/.test(cleaned);
}

function looksDate(value: string): boolean {
  return (
    /^\d{4}[/-年]\d{1,2}[/-月]\d{1,2}/.test(value.trim()) ||
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value.trim())
  );
}

function looksCurrency(value: string): boolean {
  return /[円¥￥$€]/.test(value) || /^-?[\d,，]+(\.\d+)?円$/.test(value.trim());
}

function inferColumnKind(
  header: string,
  samples: string[],
  options?: XlsxGenerateOptions,
): ColumnKind {
  if (headerSuggestsCurrency(header) || options?.excel?.currency) {
    if (
      headerSuggestsCurrency(header) ||
      samples.some((s) => looksCurrency(s) || looksNumeric(s))
    ) {
      if (headerSuggestsCurrency(header) || samples.some(looksCurrency)) {
        return "currency";
      }
    }
  }
  if (headerSuggestsDate(header) || options?.excel?.dateFormat) {
    if (headerSuggestsDate(header) || samples.some(looksDate)) {
      return "date";
    }
  }
  if (headerSuggestsNumber(header) || samples.every((s) => !s || looksNumeric(s))) {
    if (samples.some(looksNumeric)) return "number";
  }
  if (samples.filter(Boolean).every((s) => looksDate(s))) return "date";
  if (samples.filter(Boolean).every((s) => looksCurrency(s) || looksNumeric(s))) {
    if (samples.some(looksCurrency) || headerSuggestsCurrency(header)) {
      return "currency";
    }
  }
  return "text";
}

function parseNumber(raw: string, decimalPlaces: number | null | undefined): number | null {
  const cleaned = raw.replace(/[,，\s¥￥円$€]/g, "").replace(/%$/, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  if (decimalPlaces != null) {
    return Number(num.toFixed(decimalPlaces));
  }
  return num;
}

function parseDate(raw: string): Date | null {
  const trimmed = raw.trim();
  const iso = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const ja = trimmed.match(/^(\d{4})年(\d{1,2})月(\d{1,2})/);
  if (ja) {
    const dt = new Date(
      Date.UTC(Number(ja[1]), Number(ja[2]) - 1, Number(ja[3])),
    );
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function applySheetFormatting(
  sheet: ExcelJS.Worksheet,
  rowCount: number,
  columnCount: number,
  options?: XlsxGenerateOptions,
): void {
  if (columnCount < 1 || rowCount < 1) return;

  const header = sheet.getRow(1);
  header.font = { bold: true, name: "Yu Gothic", size: 11, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: {
      argb: options?.excel?.headerColorArgb ?? "FF1F4E79",
    },
  };
  header.alignment = { vertical: "middle", horizontal: "left", wrapText: true };

  for (let row = 1; row <= rowCount; row += 1) {
    const excelRow = sheet.getRow(row);
    excelRow.font = {
      ...(excelRow.font ?? {}),
      name: excelRow.font?.name ?? "Yu Gothic",
      size: excelRow.font?.size ?? 11,
      bold: row === 1 ? true : excelRow.font?.bold,
    };
    for (let col = 1; col <= columnCount; col += 1) {
      const cell = excelRow.getCell(col);
      cell.border = THIN_BORDER;
      cell.alignment = {
        vertical: "middle",
        horizontal: typeof cell.value === "number" ? "right" : "left",
        wrapText: true,
      };
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rowCount, column: columnCount },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  autofitColumns(sheet, columnCount);
}

/**
 * Excel (.xlsx) generator — builds worksheets from AI table data via exceljs.
 * P1-08: typed cells + numFmt (no currency/date sidecar text columns).
 */
export class XlsxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "xlsx" as const;

  async generate(
    content: string,
    baseFileName: string,
    options?: XlsxGenerateOptions,
  ): Promise<GeneratedDeliverableFile> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = options?.companyName ?? "MINERVOT";
    workbook.created = new Date();

    const sheets = extractExcelSheets(content);
    let appliedNumFmt = false;

    for (const data of sheets) {
      const sheet = workbook.addWorksheet(data.name);
      let headers = [...data.headers];
      let rows = data.rows.map((row) => [...row]);
      const preferredOrder = options?.excel?.columnOrder ?? [];
      if (preferredOrder.length > 0 && headers.length > 0) {
        const indexMap = preferredOrder
          .map((name) => headers.findIndex((h) => h === name))
          .filter((idx) => idx >= 0);
        const remaining = headers
          .map((_, idx) => idx)
          .filter((idx) => !indexMap.includes(idx));
        const order = [...indexMap, ...remaining];
        headers = order.map((idx) => headers[idx] ?? "");
        rows = rows.map((row) => order.map((idx) => row[idx] ?? ""));
      }
      const columnCount = Math.max(
        headers.length,
        ...rows.map((row) => row.length),
        1,
      );
      const header = [...headers];
      while (header.length < columnCount) header.push("");

      const kinds: ColumnKind[] = header.map((h, colIdx) => {
        const samples = rows.map((row) => String(row[colIdx] ?? ""));
        // Currency option alone must not force every column — only currency-like ones.
        const scoped: XlsxGenerateOptions = {
          ...options,
          excel: {
            ...options?.excel,
            currency: headerSuggestsCurrency(h) || samples.some(looksCurrency)
              ? options?.excel?.currency
              : undefined,
            dateFormat:
              headerSuggestsDate(h) || samples.some(looksDate)
                ? options?.excel?.dateFormat
                : undefined,
          },
        };
        return inferColumnKind(h, samples, scoped);
      });

      sheet.addRow(header.map((cell) => neutralizeSpreadsheetCell(cell)));

      for (const row of rows) {
        const cells = [...row];
        while (cells.length < columnCount) cells.push("");
        const excelRow = sheet.addRow(
          cells.map((cell, colIdx) => {
            const raw = String(cell ?? "");
            const kind = kinds[colIdx] ?? "text";
            if (kind === "currency" || kind === "number") {
              const num = parseNumber(raw, options?.excel?.decimalPlaces);
              if (num != null) return num;
            }
            if (kind === "date") {
              const dt = parseDate(raw);
              if (dt) return dt;
            }
            if (
              options?.excel?.decimalPlaces != null &&
              /^-?\d+(\.\d+)?$/.test(raw)
            ) {
              return Number(Number(raw).toFixed(options.excel.decimalPlaces));
            }
            return neutralizeSpreadsheetCell(raw);
          }),
        );

        for (let col = 1; col <= columnCount; col += 1) {
          const kind = kinds[col - 1] ?? "text";
          const cell = excelRow.getCell(col);
          if (kind === "currency" && typeof cell.value === "number") {
            cell.numFmt = currencyNumFmt(options?.excel?.currency);
            appliedNumFmt = true;
          } else if (kind === "number" && typeof cell.value === "number") {
            const places = options?.excel?.decimalPlaces;
            cell.numFmt =
              places != null && places > 0
                ? `0.${"0".repeat(places)}`
                : "#,##0";
            appliedNumFmt = true;
          } else if (kind === "date" && cell.value instanceof Date) {
            cell.numFmt = dateNumFmt(options?.excel?.dateFormat);
            appliedNumFmt = true;
          }
        }
      }

      applySheetFormatting(sheet, rows.length + 1, columnCount, options);

      // P1-08: never write sidecar 通貨:/日付: text columns — numFmt is SoT.
      void appliedNumFmt;
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return createDeliverableFile("xlsx", baseFileName, buffer, false);
  }
}

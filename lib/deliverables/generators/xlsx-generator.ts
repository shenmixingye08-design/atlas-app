import ExcelJS from "exceljs";

import {
  assignmentIsImageToExcel,
  extractExcelSheets,
  type ExcelSheetData,
} from "../excel-data";
import {
  type ChartKind,
  type ChartSpec,
  injectChartsIntoXlsx,
} from "../excel-production/charts";
import {
  type ExcelCellKind,
  coerceTypedCell,
  colLetter,
  inferColumnKinds,
} from "../excel-production/cell-types";
import { buildFormulaCatalogRows } from "../excel-production/formulas";
import { buildImageExcelSheets } from "../excel-production/image-to-excel";
import { assertXlsxProductionOrThrow } from "../excel-production/xlsx-quality";
import type { DeliverableGenerator, GeneratedDeliverableFile } from "../types";
import { createDeliverableFile } from "./shared";

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFB0B0B0" } },
  left: { style: "thin", color: { argb: "FFB0B0B0" } },
  bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
  right: { style: "thin", color: { argb: "FFB0B0B0" } },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" },
};

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
            : cell.text || String(cell.value);
      max = Math.max(max, cellDisplayWidth(text));
    });
    column.width = Math.min(Math.max(max + 2, 10), 60);
  }
}

function applyPrintLayout(sheet: ExcelJS.Worksheet): void {
  sheet.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.6,
      bottom: 0.6,
      header: 0.3,
      footer: 0.3,
    },
  };
  sheet.headerFooter = {
    oddHeader: "&C&A",
    oddFooter: "&C&P / &N",
  };
}

function applySheetFormatting(
  sheet: ExcelJS.Worksheet,
  rowCount: number,
  columnCount: number,
  options?: { freezeCols?: number },
): void {
  if (columnCount < 1 || rowCount < 1) return;

  const header = sheet.getRow(1);
  header.font = { bold: true, name: "Yu Gothic", size: 11, color: { argb: "FF1A1A1A" } };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.height = 22;
  header.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
  });

  for (let row = 2; row <= rowCount; row += 1) {
    const excelRow = sheet.getRow(row);
    excelRow.font = { name: "Yu Gothic", size: 11 };
    excelRow.height = 18;
    for (let col = 1; col <= columnCount; col += 1) {
      const cell = excelRow.getCell(col);
      cell.border = THIN_BORDER;
      if (!cell.alignment) {
        cell.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true,
        };
      } else {
        cell.alignment = {
          ...cell.alignment,
          vertical: "middle",
          wrapText: true,
        };
      }
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rowCount, column: columnCount },
  };
  sheet.views = [
    {
      state: "frozen",
      ySplit: 1,
      xSplit: options?.freezeCols && options.freezeCols > 0 ? options.freezeCols : 0,
    },
  ];
  sheet.pageSetup.printArea = `A1:${colLetter(columnCount)}${rowCount}`;
  applyPrintLayout(sheet);
  autofitColumns(sheet, columnCount);
}

function writeTypedRow(
  sheet: ExcelJS.Worksheet,
  values: string[],
  kinds: ExcelCellKind[],
  columnCount: number,
): void {
  const row = sheet.addRow(new Array(columnCount).fill(""));
  for (let col = 1; col <= columnCount; col += 1) {
    const raw = values[col - 1] ?? "";
    const kind = kinds[col - 1] ?? "text";
    const coerced = coerceTypedCell(raw, kind);
    const cell = row.getCell(col);
    cell.value = coerced.value as ExcelJS.CellValue;
    if (coerced.numFmt) cell.numFmt = coerced.numFmt;
    cell.alignment = {
      vertical: "middle",
      horizontal: coerced.align ?? "left",
      wrapText: true,
    };
    cell.font = { name: "Yu Gothic", size: 11 };
  }
}

function addTotalFormulaRow(
  sheet: ExcelJS.Worksheet,
  kinds: ExcelCellKind[],
  dataRowCount: number,
  columnCount: number,
): number {
  const numericKinds: ExcelCellKind[] = [
    "number",
    "integer",
    "decimal",
    "currency",
    "percent",
  ];
  const totalCols = kinds
    .map((k, i) => (numericKinds.includes(k) ? i + 1 : -1))
    .filter((i) => i > 0);
  if (totalCols.length === 0 || dataRowCount < 1) return dataRowCount + 1;

  const totalRowIndex = dataRowCount + 2; // header + data + total
  const row = sheet.getRow(totalRowIndex);
  row.getCell(1).value = "合計";
  row.getCell(1).font = { bold: true, name: "Yu Gothic", size: 11 };
  for (const col of totalCols) {
    const letter = colLetter(col);
    const cell = row.getCell(col);
    cell.value = {
      formula: `SUM(${letter}2:${letter}${dataRowCount + 1})`,
    };
    cell.font = { bold: true, name: "Yu Gothic", size: 11 };
    const kind = kinds[col - 1];
    if (kind === "currency") cell.numFmt = '¥#,##0';
    else if (kind === "percent") cell.numFmt = "0.0%";
    else cell.numFmt = "#,##0.##";
    cell.alignment = { horizontal: "right", vertical: "middle" };
  }
  for (let col = 1; col <= columnCount; col += 1) {
    row.getCell(col).border = THIN_BORDER;
    row.getCell(col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF7F7F7" },
    };
  }
  return totalRowIndex;
}

function addFormulaCatalogSheet(
  workbook: ExcelJS.Workbook,
  dataSheetName: string,
  kinds: ExcelCellKind[],
  dataRowCount: number,
): void {
  const amountCol =
    kinds.findIndex((k) =>
      ["currency", "number", "integer", "decimal"].includes(k),
    ) + 1;
  const keyCol =
    kinds.findIndex((k) => k === "text") + 1 || 1;
  if (amountCol < 1 || dataRowCount < 1) return;

  const sheet = workbook.addWorksheet("数式");
  sheet.addRow(["関数", "結果"]);
  const catalog = buildFormulaCatalogRows({
    dataSheetName,
    amountCol,
    keyCol: keyCol > 0 ? keyCol : 1,
    dataRowCount,
  });
  for (const item of catalog) {
    const row = sheet.addRow([item.label, ""]);
    row.getCell(2).value = { formula: item.formula };
    row.getCell(1).font = { name: "Yu Gothic", size: 11 };
    row.getCell(2).font = { name: "Yu Gothic", size: 11 };
  }
  applySheetFormatting(sheet, catalog.length + 1, 2);
}

function pickChartKind(index: number): ChartKind {
  const kinds: ChartKind[] = ["bar", "line", "pie", "stacked", "combo"];
  return kinds[index % kinds.length]!;
}

function resolveSheets(content: string, assignment?: string): {
  sheets: ExcelSheetData[];
  mergeTitle: string | null;
  imageForm: boolean;
} {
  if (assignment && assignmentIsImageToExcel(assignment)) {
    const built = buildImageExcelSheets(assignment, content);
    return {
      sheets: built.sheets,
      mergeTitle: built.mergeTitle,
      imageForm: true,
    };
  }
  // Also treat OCR-like invoice/receipt content without assignment keyword
  if (/請求書|領収書|レシート/.test(content) && contentHasFormSignals(content)) {
    const built = buildImageExcelSheets(assignment ?? content.slice(0, 80), content);
    return {
      sheets: built.sheets,
      mergeTitle: built.mergeTitle,
      imageForm: true,
    };
  }
  return {
    sheets: extractExcelSheets(content),
    mergeTitle: null,
    imageForm: false,
  };
}

function contentHasFormSignals(content: string): boolean {
  return (
    extractExcelSheets(content).some((s) => s.rows.length > 0) ||
    /日付[:：]|合計[:：]|金額[:：]/.test(content)
  );
}

/**
 * Excel (.xlsx) generator — production-ready typed cells, formulas, layout, charts.
 */
export class XlsxDeliverableGenerator implements DeliverableGenerator {
  readonly format = "xlsx" as const;

  async generate(
    content: string,
    baseFileName: string,
    options?: Record<string, unknown>,
  ): Promise<GeneratedDeliverableFile> {
    const assignment =
      typeof options?.assignment === "string" ? options.assignment : undefined;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "MINERVOT";
    workbook.created = new Date();
    workbook.calcProperties = { fullCalcOnLoad: true };

    const { sheets, mergeTitle, imageForm } = resolveSheets(content, assignment);
    const chartSpecs: ChartSpec[] = [];
    const sheetNames: string[] = [];
    let formulaSheetAttached = false;

    for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
      const data = sheets[sheetIndex]!;
      const sheet = workbook.addWorksheet(data.name);
      sheetNames.push(data.name);

      const columnCount = Math.max(
        data.headers.length,
        ...data.rows.map((row) => row.length),
        1,
      );
      const headers = [...data.headers];
      while (headers.length < columnCount) headers.push("");
      const kinds = inferColumnKinds(headers, data.rows);

      if (mergeTitle && sheetIndex === 0 && data.name === "表紙") {
        sheet.mergeCells(1, 1, 1, 2);
        const titleCell = sheet.getCell(1, 1);
        titleCell.value = mergeTitle;
        titleCell.font = { bold: true, name: "Yu Gothic", size: 16 };
        titleCell.alignment = { horizontal: "center", vertical: "middle" };
        sheet.addRow([]);
        sheet.addRow(["項目", "内容"]);
        const bodyKinds: ExcelCellKind[] = ["text", "text"];
        for (const row of data.rows) {
          writeTypedRow(sheet, row, bodyKinds, 2);
        }
        const rowCount = data.rows.length + 3;
        applySheetFormatting(sheet, rowCount, 2);
        // Re-style title row after formatting
        sheet.getRow(1).font = { bold: true, name: "Yu Gothic", size: 16 };
        continue;
      }

      sheet.addRow(headers);
      for (const row of data.rows) {
        const cells = [...row];
        while (cells.length < columnCount) cells.push("");
        writeTypedRow(sheet, cells, kinds, columnCount);
      }

      const lastDataRow = data.rows.length + 1;
      const totalRow = addTotalFormulaRow(
        sheet,
        kinds,
        data.rows.length,
        columnCount,
      );
      applySheetFormatting(sheet, totalRow, columnCount, {
        freezeCols: imageForm ? 1 : 0,
      });

      const valueCol =
        kinds.findIndex((k) =>
          ["currency", "number", "integer", "decimal", "percent"].includes(k),
        ) + 1;
      const categoryCol =
        kinds.findIndex((k) => k === "text") + 1 || 1;
      if (valueCol > 0 && data.rows.length >= 2 && chartSpecs.length < 5) {
        const kind = pickChartKind(chartSpecs.length);
        chartSpecs.push({
          kind,
          title: `${data.name}グラフ`,
          sheetIndex,
          categoryCol: categoryCol > 0 ? categoryCol : 1,
          valueCol,
          valueCol2:
            kind === "combo"
              ? kinds.findIndex(
                  (k, idx) =>
                    idx + 1 !== valueCol &&
                    ["currency", "number", "integer", "decimal"].includes(k),
                ) + 1 || valueCol
              : undefined,
          startRow: 2,
          endRow: lastDataRow,
        });
      }

      if (!formulaSheetAttached && valueCol > 0 && data.rows.length > 0) {
        addFormulaCatalogSheet(workbook, data.name, kinds, data.rows.length);
        formulaSheetAttached = true;
        sheetNames.push("数式");
      }
    }

    // Multi-sheet integrity: summary sheet referencing first data sheet
    if (sheets.length > 1) {
      const summary = workbook.addWorksheet("シート一覧");
      summary.addRow(["シート名", "行数", "参照"]);
      sheets.forEach((s, i) => {
        const row = summary.addRow([s.name, s.rows.length, ""]);
        row.getCell(3).value = {
          formula: `'${s.name.replace(/'/g, "''")}'!A1`,
        };
        void i;
      });
      applySheetFormatting(summary, sheets.length + 1, 3);
      sheetNames.push("シート一覧");
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    let buffer = Buffer.from(arrayBuffer);

    if (chartSpecs.length > 0) {
      // Map sheetIndex to workbook worksheet order before 数式/一覧 insertions
      const adjusted = chartSpecs.map((spec) => {
        const name = sheets[spec.sheetIndex]?.name;
        const actualIndex = workbook.worksheets.findIndex((ws) => ws.name === name);
        return {
          ...spec,
          sheetIndex: actualIndex >= 0 ? actualIndex : spec.sheetIndex,
        };
      });
      const names = workbook.worksheets.map((ws) => ws.name);
      const withCharts = await injectChartsIntoXlsx(buffer, adjusted, names);
      buffer = Buffer.from(withCharts);
    }

    assertXlsxProductionOrThrow(buffer);
    return createDeliverableFile("xlsx", baseFileName, buffer, false);
  }
}

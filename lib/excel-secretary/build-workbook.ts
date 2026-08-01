import ExcelJS from "exceljs";

import {
  cellDisplayWidth,
  EXCEL_DESIGN,
  numFmtForKind,
  THIN_BORDER,
} from "./design";
import { cellAddress, networkdaysFormula, tableOrigin } from "./formulas";
import type {
  ExcelCellModel,
  ExcelPreviewPayload,
  ExcelSheetModel,
  ExcelWorkbookModel,
} from "./types";
import { renderSheetCharts } from "./charts";

function coerceValue(cell: ExcelCellModel): ExcelJS.CellValue {
  if (cell.formula) {
    return { formula: cell.formula.replace(/^=/, ""), result: undefined };
  }
  if (cell.value instanceof Date) return cell.value;
  if (cell.value == null) return null;
  return cell.value as ExcelJS.CellValue;
}

function applyCellStyle(
  excelCell: ExcelJS.Cell,
  model: ExcelCellModel,
  kind = model.kind,
): void {
  excelCell.border = THIN_BORDER;
  excelCell.font = {
    name: EXCEL_DESIGN.fontName,
    size: EXCEL_DESIGN.fontSize,
    bold: Boolean(model.bold),
    color: model.fillArgb === EXCEL_DESIGN.headerFill
      ? { argb: EXCEL_DESIGN.headerFont }
      : undefined,
  };
  if (model.fillArgb) {
    excelCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: model.fillArgb },
    };
  }
  const fmt = model.numFmt ?? (kind ? numFmtForKind(kind) : undefined);
  if (fmt) excelCell.numFmt = fmt;
  excelCell.alignment = {
    vertical: "middle",
    horizontal: model.align ?? (kind === "number" || kind === "currency" ? "right" : "left"),
    wrapText: true,
  };
}

function autofit(sheet: ExcelJS.Worksheet, columnCount: number): void {
  for (let col = 1; col <= columnCount; col += 1) {
    let max: number = EXCEL_DESIGN.minColumnWidth;
    sheet.getColumn(col).eachCell({ includeEmpty: true }, (cell) => {
      const text =
        cell.value == null
          ? ""
          : typeof cell.value === "object" &&
              cell.value &&
              "formula" in (cell.value as object)
            ? String((cell.value as { formula?: string }).formula ?? "")
            : String(cell.value);
      max = Math.max(max, cellDisplayWidth(text));
    });
    sheet.getColumn(col).width = Math.min(
      Math.max(max + 2, EXCEL_DESIGN.minColumnWidth),
      EXCEL_DESIGN.maxColumnWidth,
    );
  }
}

function enrichGanttFormulas(sheet: ExcelSheetModel): ExcelSheetModel {
  if (!/工程|ガント|gantt/i.test(sheet.name + (sheet.title ?? ""))) return sheet;
  const startIdx = sheet.columns.findIndex((c) => c.key === "start");
  const endIdx = sheet.columns.findIndex((c) => c.key === "end");
  const daysIdx = sheet.columns.findIndex((c) => c.key === "days");
  if (startIdx < 0 || endIdx < 0 || daysIdx < 0) return sheet;
  const origin = tableOrigin(Boolean(sheet.title));
  const rows = sheet.rows.map((row, rowOffset) => {
    const excelRow = origin.firstDataRow + rowOffset;
    // Skip total-like rows
    if (row[0]?.value === "合計") return row;
    const next = [...row];
    next[daysIdx] = {
      ...next[daysIdx],
      formula: networkdaysFormula(
        cellAddress(excelRow, startIdx + 1),
        cellAddress(excelRow, endIdx + 1),
      ),
      kind: "number",
    };
    return next;
  });
  return { ...sheet, rows };
}

function writeSheet(workbook: ExcelJS.Workbook, rawSheet: ExcelSheetModel): void {
  const sheetModel = enrichGanttFormulas(rawSheet);
  const sheet = workbook.addWorksheet(sheetModel.name.slice(0, 31));
  const columnCount = Math.max(sheetModel.columns.length, 1);
  const origin = tableOrigin(Boolean(sheetModel.title));

  if (sheetModel.title) {
    sheet.mergeCells(1, 1, 1, columnCount);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = sheetModel.title;
    titleCell.font = {
      name: EXCEL_DESIGN.fontName,
      size: EXCEL_DESIGN.titleFontSize,
      bold: true,
      color: { argb: EXCEL_DESIGN.headerFill },
    };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    sheet.getRow(1).height = 28;
  }

  // Header
  for (let c = 0; c < columnCount; c += 1) {
    const column = sheetModel.columns[c];
    const cell = sheet.getCell(origin.headerRow, c + 1);
    cell.value = column?.header ?? `列${c + 1}`;
    applyCellStyle(cell, {
      value: column?.header ?? "",
      bold: true,
      fillArgb: EXCEL_DESIGN.headerFill,
      align: "center",
    });
    cell.font = {
      name: EXCEL_DESIGN.fontName,
      size: EXCEL_DESIGN.fontSize,
      bold: true,
      color: { argb: EXCEL_DESIGN.headerFont },
    };
  }

  // Body (written as cells so formulas/numFmt survive; Table style via autoFilter)
  sheetModel.rows.forEach((row, rowOffset) => {
    const excelRow = origin.firstDataRow + rowOffset;
    const alt = rowOffset % 2 === 1;
    for (let c = 0; c < columnCount; c += 1) {
      const model =
        row[c] ??
        ({ value: "" } satisfies ExcelCellModel);
      const kind = model.kind ?? sheetModel.columns[c]?.kind ?? "text";
      const cell = sheet.getCell(excelRow, c + 1);
      cell.value = coerceValue({ ...model, kind });
      applyCellStyle(
        cell,
        {
          ...model,
          fillArgb:
            model.fillArgb ??
            (alt && model.value !== "合計" ? EXCEL_DESIGN.altRowFill : undefined),
          kind,
        },
        kind,
      );
      const merge = model.merge;
      if (merge?.colSpan && merge.colSpan > 1) {
        sheet.mergeCells(
          excelRow,
          c + 1,
          excelRow + (merge.rowSpan ?? 1) - 1,
          c + merge.colSpan,
        );
      }
    }
  });

  for (const abs of sheetModel.absoluteCells ?? []) {
    const cell = sheet.getCell(abs.row, abs.col);
    cell.value = coerceValue(abs.cell);
    applyCellStyle(cell, abs.cell);
  }

  const lastRow = origin.firstDataRow + Math.max(sheetModel.rows.length, 1) - 1;
  // Table-like UX: autofilter + frozen header (formulas/numFmt stay on cells).
  if (sheetModel.rows.length > 0 && sheetModel.asTable !== false) {
    sheet.autoFilter = {
      from: { row: origin.headerRow, column: 1 },
      to: { row: lastRow, column: columnCount },
    };
  }

  if (sheetModel.freezeHeader !== false) {
    sheet.views = [{ state: "frozen", ySplit: origin.headerRow }];
  }

  sheet.pageSetup = {
    orientation: sheetModel.printLandscape ? "landscape" : "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };
  sheet.headerFooter = {
    oddHeader: `&L${sheetModel.title ?? sheetModel.name}&RMINERVOT`,
    oddFooter: "&C&P / &N",
  };

  autofit(sheet, columnCount);
  renderSheetCharts(sheet, sheetModel, origin);
}

/**
 * Build an exceljs Workbook from the secretary model.
 * Supports streaming path for large row counts via writeWorkbookBuffer options.
 */
export async function buildExcelJsWorkbook(
  model: ExcelWorkbookModel,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = model.creator ?? "MINERVOT";
  workbook.created = new Date();
  workbook.company = "MINERVOT";
  workbook.description = model.title;

  for (const sheet of model.sheets) {
    writeSheet(workbook, sheet);
  }
  if (workbook.worksheets.length === 0) {
    workbook.addWorksheet("データ");
  }
  return workbook;
}

export async function writeWorkbookBuffer(
  model: ExcelWorkbookModel,
): Promise<Buffer> {
  // Large sheet path: use streaming writer when any sheet exceeds threshold.
  const large = model.sheets.some((sheet) => sheet.rows.length >= 50_000);
  if (large) {
    return writeWorkbookBufferStreaming(model);
  }
  const workbook = await buildExcelJsWorkbook(model);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** Streaming writer for large datasets (design target: 1M rows scale). */
export async function writeWorkbookBufferStreaming(
  model: ExcelWorkbookModel,
): Promise<Buffer> {
  const { PassThrough } = await import("node:stream");
  const chunks: Buffer[] = [];
  const stream = new PassThrough();
  stream.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useStyles: true,
    useSharedStrings: true,
  });
  workbook.creator = model.creator ?? "MINERVOT";

  for (const sheetModel of model.sheets) {
    const sheet = workbook.addWorksheet(sheetModel.name.slice(0, 31));
    const origin = tableOrigin(Boolean(sheetModel.title));
    if (sheetModel.title) {
      const row = sheet.addRow([sheetModel.title]);
      row.font = { name: EXCEL_DESIGN.fontName, size: 14, bold: true };
      row.commit();
    }
    const header = sheet.addRow(sheetModel.columns.map((c) => c.header));
    header.font = { bold: true, name: EXCEL_DESIGN.fontName };
    header.commit();
    for (const rowModel of sheetModel.rows) {
      const values = rowModel.map((cell) =>
        cell.formula
          ? { formula: cell.formula.replace(/^=/, "") }
          : (cell.value ?? ""),
      );
      const row = sheet.addRow(values);
      row.commit();
    }
    void origin;
    sheet.commit();
  }
  await workbook.commit();
  return Buffer.concat(chunks);
}

export function toPreviewPayload(
  model: ExcelWorkbookModel,
  activeSheetIndex = 0,
): ExcelPreviewPayload {
  return {
    title: model.title,
    kind: model.kind,
    activeSheetIndex,
    sheets: model.sheets.map((sheet) => ({
      name: sheet.name,
      headers: sheet.columns.map((c) => c.header),
      rows: sheet.rows.slice(0, 100).map((row) =>
        row.map((cell) => {
          if (cell.formula) return `=${cell.formula.replace(/^=/, "")}`;
          if (cell.value instanceof Date) {
            return cell.value.toISOString().slice(0, 10);
          }
          return cell.value == null ? "" : String(cell.value);
        }),
      ),
      rowCount: sheet.rows.length,
      columnCount: sheet.columns.length,
    })),
  };
}

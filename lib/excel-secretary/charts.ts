import type ExcelJS from "exceljs";

import { EXCEL_DESIGN } from "./design";
import type { ExcelChartSpec, ExcelSheetModel } from "./types";

type TableOrigin = { headerRow: number; firstDataRow: number };

/**
 * ExcelJS has no first-class chart API. We render a print-ready visual chart
 * using cells (bar/column) plus a dedicated series block so users can convert
 * to a native Excel chart in one click if needed.
 */
export function renderSheetCharts(
  sheet: ExcelJS.Worksheet,
  model: ExcelSheetModel,
  origin: TableOrigin,
): void {
  const charts = model.charts ?? [];
  if (charts.length === 0) return;

  charts.forEach((chart, index) => {
    renderVisualChart(sheet, model, origin, chart, index);
  });
}

function parseAnchor(anchor: string | undefined): { row: number; col: number } {
  if (!anchor) return { row: 2, col: 10 };
  const m = /^([A-Z]+)(\d+)$/i.exec(anchor.trim());
  if (!m) return { row: 2, col: 10 };
  const letters = m[1]!.toUpperCase();
  let col = 0;
  for (const ch of letters) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { row: Number(m[2]), col };
}

function collectNumericSeries(
  model: ExcelSheetModel,
  chart: ExcelChartSpec,
): { labels: string[]; values: number[] } {
  // Prefer reading from model rows using first text col + first currency/number col.
  const labelCol =
    model.columns.findIndex((c) => c.kind === "text") >= 0
      ? model.columns.findIndex((c) => c.kind === "text")
      : 0;
  const valueCol =
    model.columns.findIndex((c) => c.kind === "currency" || c.key === "amount") >= 0
      ? model.columns.findIndex((c) => c.kind === "currency" || c.key === "amount")
      : model.columns.findIndex((c) => c.kind === "number");

  const labels: string[] = [];
  const values: number[] = [];
  for (const row of model.rows) {
    if (row[0]?.value === "合計") continue;
    const label = String(row[labelCol]?.value ?? "");
    const raw = row[valueCol >= 0 ? valueCol : 0]?.value;
    const num =
      typeof raw === "number"
        ? raw
        : Number(String(raw ?? "").replace(/[,¥￥円\s]/g, ""));
    if (!label || !Number.isFinite(num)) continue;
    labels.push(label);
    values.push(num);
  }

  // Fallback empty chart markers from ranges (documentation only).
  if (labels.length === 0) {
    return {
      labels: [chart.title],
      values: [0],
    };
  }
  return { labels, values };
}

function renderVisualChart(
  sheet: ExcelJS.Worksheet,
  model: ExcelSheetModel,
  _origin: TableOrigin,
  chart: ExcelChartSpec,
  index: number,
): void {
  const { labels, values } = collectNumericSeries(model, chart);
  const max = Math.max(...values, 1);
  const anchor = parseAnchor(chart.anchor);
  const startCol = anchor.col + index * 8;
  const startRow = anchor.row;

  const titleCell = sheet.getCell(startRow, startCol);
  titleCell.value = `【${chart.type}】${chart.title}`;
  titleCell.font = {
    name: EXCEL_DESIGN.fontName,
    bold: true,
    size: 12,
    color: { argb: EXCEL_DESIGN.headerFill },
  };

  sheet.getCell(startRow + 1, startCol).value = "項目";
  sheet.getCell(startRow + 1, startCol + 1).value = "値";
  sheet.getCell(startRow + 1, startCol + 2).value = "グラフ";
  for (let c = 0; c < 3; c += 1) {
    const header = sheet.getCell(startRow + 1, startCol + c);
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: EXCEL_DESIGN.headerFill },
    };
    header.font = {
      name: EXCEL_DESIGN.fontName,
      bold: true,
      color: { argb: EXCEL_DESIGN.headerFont },
    };
  }

  labels.slice(0, 20).forEach((label, i) => {
    const row = startRow + 2 + i;
    const value = values[i] ?? 0;
    sheet.getCell(row, startCol).value = label;
    sheet.getCell(row, startCol + 1).value = value;
    sheet.getCell(row, startCol + 1).numFmt = EXCEL_DESIGN.currencyFmt;
    const barCell = sheet.getCell(row, startCol + 2);
    const units = Math.max(1, Math.round((value / max) * 20));
    if (chart.type === "pie") {
      const pct = Math.round((value / values.reduce((a, b) => a + b, 0)) * 100);
      barCell.value = `${"●".repeat(Math.max(1, Math.round(pct / 10)))} ${pct}%`;
    } else {
      barCell.value = "█".repeat(units);
    }
    barCell.font = {
      name: EXCEL_DESIGN.fontName,
      color: { argb: chart.type === "line" ? "FF2E7D32" : "FF1F4E79" },
    };
  });

  sheet.getColumn(startCol).width = 18;
  sheet.getColumn(startCol + 1).width = 12;
  sheet.getColumn(startCol + 2).width = 24;
}

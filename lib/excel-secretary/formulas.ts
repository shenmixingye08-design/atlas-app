import type { ExcelCellKind, ExcelColumnModel } from "./types";

/** Column letter from 1-based index (1=A). */
export function colLetter(index1: number): string {
  let n = index1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || "A";
}

export function cellAddress(row1: number, col1: number): string {
  return `${colLetter(col1)}${row1}`;
}

export function rangeAddress(
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): string {
  return `${cellAddress(r1, c1)}:${cellAddress(r2, c2)}`;
}

/** Data body starts at this Excel row when title row is present. */
export function tableOrigin(hasTitle: boolean): {
  headerRow: number;
  firstDataRow: number;
} {
  if (hasTitle) return { headerRow: 2, firstDataRow: 3 };
  return { headerRow: 1, firstDataRow: 2 };
}

export function sumFormula(col1: number, firstRow: number, lastRow: number): string {
  return `SUM(${rangeAddress(firstRow, col1, lastRow, col1)})`;
}

export function averageFormula(
  col1: number,
  firstRow: number,
  lastRow: number,
): string {
  return `AVERAGE(${rangeAddress(firstRow, col1, lastRow, col1)})`;
}

export function countFormula(
  col1: number,
  firstRow: number,
  lastRow: number,
): string {
  return `COUNTA(${rangeAddress(firstRow, col1, lastRow, col1)})`;
}

export function countIfFormula(
  criteriaCol: number,
  firstRow: number,
  lastRow: number,
  criteria: string,
): string {
  return `COUNTIF(${rangeAddress(firstRow, criteriaCol, lastRow, criteriaCol)},${JSON.stringify(criteria)})`;
}

export function sumIfFormula(
  criteriaCol: number,
  sumCol: number,
  firstRow: number,
  lastRow: number,
  criteria: string,
): string {
  return `SUMIF(${rangeAddress(firstRow, criteriaCol, lastRow, criteriaCol)},${JSON.stringify(criteria)},${rangeAddress(firstRow, sumCol, lastRow, sumCol)})`;
}

export function xlookupFormula(
  lookupCell: string,
  lookupRange: string,
  returnRange: string,
): string {
  return `XLOOKUP(${lookupCell},${lookupRange},${returnRange},"未検出")`;
}

export function vlookupFormula(
  lookupCell: string,
  tableRange: string,
  colIndex: number,
): string {
  return `VLOOKUP(${lookupCell},${tableRange},${colIndex},FALSE)`;
}

export function ifFormula(test: string, whenTrue: string, whenFalse: string): string {
  return `IF(${test},${whenTrue},${whenFalse})`;
}

export function roundFormula(expression: string, digits = 0): string {
  return `ROUND(${expression},${digits})`;
}

export function networkdaysFormula(startCell: string, endCell: string): string {
  return `NETWORKDAYS(${startCell},${endCell})`;
}

export function datedifFormula(
  startCell: string,
  endCell: string,
  unit: "Y" | "M" | "D" = "D",
): string {
  return `DATEDIF(${startCell},${endCell},${JSON.stringify(unit)})`;
}

export function textFormula(cell: string, format: string): string {
  return `TEXT(${cell},${JSON.stringify(format)})`;
}

/**
 * Auto formulas for a sheet: amount/qty totals, counts, averages.
 * Returns cells to place on a totals row (same width as columns).
 */
export function buildAutoTotalRow(input: {
  columns: ExcelColumnModel[];
  firstDataRow: number;
  lastDataRow: number;
}): import("./types").ExcelCellModel[] {
  const { columns, firstDataRow, lastDataRow } = input;
  if (lastDataRow < firstDataRow) {
    return columns.map(() => ({ value: "" }));
  }
  return columns.map((column, index) => {
    const col1 = index + 1;
    if (index === 0) {
      return { value: "合計", bold: true, fillArgb: "FFE8EEF5" };
    }
    if (column.kind === "currency" || column.key === "amount" || column.key === "total") {
      return {
        formula: sumFormula(col1, firstDataRow, lastDataRow),
        kind: "currency",
        bold: true,
        fillArgb: "FFE8EEF5",
      };
    }
    if (column.kind === "number" && /qty|数量|count|件数/i.test(column.key + column.header)) {
      return {
        formula: sumFormula(col1, firstDataRow, lastDataRow),
        kind: "number",
        bold: true,
        fillArgb: "FFE8EEF5",
      };
    }
    if (column.kind === "number" && /平均|avg|average/i.test(column.header)) {
      return {
        formula: averageFormula(col1, firstDataRow, lastDataRow),
        kind: "number",
        bold: true,
        fillArgb: "FFE8EEF5",
      };
    }
    return { value: "", fillArgb: "FFE8EEF5" };
  });
}

export function kindLooksNumeric(kind: ExcelCellKind): boolean {
  return kind === "number" || kind === "currency" || kind === "percent";
}

import ExcelJS from "exceljs";

export type XlsxVerifyReason =
  | "invalid_zip"
  | "xlsx_reopen_failed"
  | "no_worksheet"
  | "empty_sheet"
  | "formula_injection"
  | "broken_formula_ref"
  | "missing_autofilter"
  | "missing_freeze_pane";

export type XlsxVerifyResult = {
  ok: boolean;
  reasons: XlsxVerifyReason[];
  sheetCount: number;
  formulaCount: number;
  hasFilter: boolean;
  hasFreeze: boolean;
};

function looksUnsafeFormula(formula: string): boolean {
  return /HYPERLINK|WEBSERVICE|DDE|CMD|EXEC|CALL\(/i.test(formula);
}

/**
 * Re-open a generated .xlsx and fail closed on corrupt / unsafe workbooks.
 */
export async function verifyXlsxWorkbook(buffer: Buffer): Promise<XlsxVerifyResult> {
  const reasons: XlsxVerifyReason[] = [];
  const head = buffer.subarray(0, 2).toString("latin1");
  if (head !== "PK") {
    return {
      ok: false,
      reasons: ["invalid_zip"],
      sheetCount: 0,
      formulaCount: 0,
      hasFilter: false,
      hasFreeze: false,
    };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return {
      ok: false,
      reasons: ["xlsx_reopen_failed"],
      sheetCount: 0,
      formulaCount: 0,
      hasFilter: false,
      hasFreeze: false,
    };
  }

  const sheets = workbook.worksheets;
  if (sheets.length < 1) reasons.push("no_worksheet");

  let formulaCount = 0;
  let hasFilter = false;
  let hasFreeze = false;

  for (const sheet of sheets) {
    if (sheet.rowCount < 1 || sheet.columnCount < 1) {
      reasons.push("empty_sheet");
      continue;
    }
    if (sheet.autoFilter) hasFilter = true;
    if (sheet.views?.some((v) => v.state === "frozen")) hasFreeze = true;
    if (sheet.rowCount > 2 && sheet.columnCount >= 2) {
      if (!sheet.autoFilter) reasons.push("missing_autofilter");
      if (!sheet.views?.some((v) => v.state === "frozen")) {
        reasons.push("missing_freeze_pane");
      }
    }

    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        const value = cell.value;
        if (value && typeof value === "object" && "formula" in value) {
          formulaCount += 1;
          const formula = String(
            (value as ExcelJS.CellFormulaValue).formula ?? "",
          );
          if (looksUnsafeFormula(formula)) reasons.push("formula_injection");
          if (/#REF!/i.test(formula)) reasons.push("broken_formula_ref");
        }
      });
    });
  }

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    sheetCount: sheets.length,
    formulaCount,
    hasFilter,
    hasFreeze,
  };
}

export type XlsxSheetInspection = {
  name: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  numberCells: number;
  dateCells: number;
  textCells: number;
  formulaTexts: string[];
  hasFilter: boolean;
  hasFreeze: boolean;
  headerFilled: boolean;
  wrapCount: number;
  currencyFmtCount: number;
  percentFmtCount: number;
  mergeCount: number;
  dimensionsOk: boolean;
};

export type XlsxInspection = {
  verify: XlsxVerifyResult;
  sheets: XlsxSheetInspection[];
};

function cellKind(value: ExcelJS.CellValue): "number" | "date" | "text" | "formula" | "empty" {
  if (value == null || value === "") return "empty";
  if (value instanceof Date) return "date";
  if (typeof value === "number") return "number";
  if (typeof value === "object" && "formula" in value) return "formula";
  return "text";
}

/**
 * Re-open and inspect a generated workbook for golden scoring.
 * Fail-closed verify is in verifyXlsxWorkbook; this adds layout/type evidence.
 */
export async function inspectXlsxWorkbook(buffer: Buffer): Promise<XlsxInspection> {
  const verify = await verifyXlsxWorkbook(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { verify, sheets: [] };
  }

  const sheets: XlsxSheetInspection[] = workbook.worksheets.map((sheet) => {
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    for (let col = 1; col <= sheet.columnCount; col += 1) {
      headers.push(String(headerRow.getCell(col).value ?? ""));
    }
    let numberCells = 0;
    let dateCells = 0;
    let textCells = 0;
    let wrapCount = 0;
    let currencyFmtCount = 0;
    let percentFmtCount = 0;
    const formulaTexts: string[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell) => {
        const kind = cellKind(cell.value);
        const fmt = String(cell.numFmt ?? "");
        if (kind === "number") {
          if (/yyyy|yy|mm-dd|h:mm/.test(fmt) && !/#,##0/.test(fmt) && !/%/.test(fmt)) {
            dateCells += 1;
          } else {
            numberCells += 1;
          }
        } else if (kind === "date") dateCells += 1;
        else if (kind === "formula") {
          formulaTexts.push(
            String((cell.value as ExcelJS.CellFormulaValue).formula ?? ""),
          );
          if (typeof (cell.value as ExcelJS.CellFormulaValue).result === "number") {
            numberCells += 1;
          }
        } else if (kind === "text") textCells += 1;
        if (cell.alignment?.wrapText) wrapCount += 1;
        if (/¥|\$|€|#,##0/.test(fmt) && !/%/.test(fmt)) currencyFmtCount += 1;
        if (/%/.test(fmt)) percentFmtCount += 1;
      });
    });
    const merges = sheet.model?.merges;
    const mergeCount = Array.isArray(merges) ? merges.length : 0;
    const headerFill = headerRow.getCell(1).fill;
    const headerFilled =
      Boolean(headerFill) &&
      typeof headerFill === "object" &&
      "fgColor" in headerFill;
    return {
      name: sheet.name,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      headers,
      numberCells,
      dateCells,
      textCells,
      formulaTexts,
      hasFilter: Boolean(sheet.autoFilter),
      hasFreeze: Boolean(sheet.views?.some((v) => v.state === "frozen")),
      headerFilled,
      wrapCount,
      currencyFmtCount,
      percentFmtCount,
      mergeCount,
      dimensionsOk: sheet.rowCount >= 1 && sheet.columnCount >= 1,
    };
  });

  return { verify, sheets };
}

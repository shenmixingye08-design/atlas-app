import { colLetter } from "./formulas";
import type { ExcelSheetModel, ExcelWorkbookModel } from "./types";

export type FormulaIssue = {
  sheet: string;
  cell: string;
  formula: string;
  code: "invalid_ref" | "empty_formula" | "circular_risk" | "unsupported";
  message: string;
};

const CELL_REF = /\b([A-Z]{1,3})(\d{1,7})\b/g;
const RANGE_REF = /\b([A-Z]{1,3})(\d{1,7}):([A-Z]{1,3})(\d{1,7})\b/g;

function maxCol(sheet: ExcelSheetModel): number {
  return Math.max(sheet.columns.length, 1);
}

function maxRow(sheet: ExcelSheetModel): number {
  // title + header + body
  const hasTitle = Boolean(sheet.title);
  return (hasTitle ? 2 : 1) + sheet.rows.length + 5;
}

/** Static validation of formula cell references (no Excel calc engine). */
export function validateWorkbookFormulas(
  model: ExcelWorkbookModel,
): FormulaIssue[] {
  const issues: FormulaIssue[] = [];
  const sheetNames = new Set(model.sheets.map((s) => s.name));

  for (const sheet of model.sheets) {
    const colMax = maxCol(sheet);
    const rowMax = maxRow(sheet);
    sheet.rows.forEach((row, rowOffset) => {
      row.forEach((cell, colIndex) => {
        if (!cell.formula) return;
        const formula = cell.formula.replace(/^=/, "").trim();
        const addr = `${colLetter(colIndex + 1)}${rowOffset + (sheet.title ? 3 : 2)}`;
        if (!formula) {
          issues.push({
            sheet: sheet.name,
            cell: addr,
            formula: "",
            code: "empty_formula",
            message: "空の数式です",
          });
          return;
        }
        if (/INDIRECT|OFFSET|EVALUATE/i.test(formula)) {
          issues.push({
            sheet: sheet.name,
            cell: addr,
            formula,
            code: "unsupported",
            message: "動的参照関数は安全性のため未対応です",
          });
        }
        // Sheet refs like 売上!A1
        for (const m of formula.matchAll(/'([^']+)'!|([A-Za-z0-9_\u3040-\u9FFF]+)!/g)) {
          const name = (m[1] ?? m[2] ?? "").trim();
          if (name && !sheetNames.has(name)) {
            issues.push({
              sheet: sheet.name,
              cell: addr,
              formula,
              code: "invalid_ref",
              message: `存在しないシート参照: ${name}`,
            });
          }
        }
        for (const m of formula.matchAll(RANGE_REF)) {
          const r1 = Number(m[2]);
          const r2 = Number(m[4]);
          if (r1 < 1 || r2 < 1 || r1 > rowMax + 1000 || r2 > rowMax + 1000) {
            issues.push({
              sheet: sheet.name,
              cell: addr,
              formula,
              code: "invalid_ref",
              message: `範囲外の行参照: ${m[0]}`,
            });
          }
        }
        for (const m of formula.matchAll(CELL_REF)) {
          const colLetters = m[1]!;
          const rowNum = Number(m[2]);
          let col = 0;
          for (const ch of colLetters) col = col * 26 + (ch.charCodeAt(0) - 64);
          if (col > colMax + 26 || rowNum > rowMax + 1000) {
            issues.push({
              sheet: sheet.name,
              cell: addr,
              formula,
              code: "invalid_ref",
              message: `範囲外参照の可能性: ${m[0]}`,
            });
          }
          // Self-ref circular risk (same cell)
          if (col === colIndex + 1 && rowNum === rowOffset + (sheet.title ? 3 : 2)) {
            issues.push({
              sheet: sheet.name,
              cell: addr,
              formula,
              code: "circular_risk",
              message: "自己参照の循環リスクがあります",
            });
          }
        }
      });
    });
  }
  return issues;
}

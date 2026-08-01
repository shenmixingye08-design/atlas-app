import type {
  ExcelCellModel,
  ExcelEditOperation,
  ExcelWorkbookModel,
} from "./types";
import { buildAutoTotalRow, tableOrigin } from "./formulas";

function sheetIndex(model: ExcelWorkbookModel, name?: string): number {
  if (!name) return 0;
  const idx = model.sheets.findIndex((s) => s.name === name);
  return idx >= 0 ? idx : 0;
}

/** Apply deterministic edit ops to a workbook model (no AI). */
export function applyExcelEdits(
  model: ExcelWorkbookModel,
  operations: ExcelEditOperation[],
): ExcelWorkbookModel {
  let next: ExcelWorkbookModel = {
    ...model,
    kind: "edited",
    sheets: model.sheets.map((sheet) => ({
      ...sheet,
      columns: [...sheet.columns],
      rows: sheet.rows.map((row) => [...row]),
    })),
  };

  for (const op of operations) {
    if (op.op === "rename_sheet") {
      next = {
        ...next,
        sheets: next.sheets.map((sheet) =>
          sheet.name === op.from ? { ...sheet, name: op.to.slice(0, 31) } : sheet,
        ),
      };
      continue;
    }

    const idx = sheetIndex(next, "sheet" in op ? op.sheet : undefined);
    const sheet = next.sheets[idx];
    if (!sheet) continue;

    if (op.op === "add_column") {
      const kind = op.kind ?? "text";
      const column = {
        key: `col_${Date.now()}`,
        header: op.header,
        kind,
      };
      const values = op.values ?? [];
      sheet.columns = [...sheet.columns, column];
      sheet.rows = sheet.rows.map((row, rowIndex) => [
        ...row,
        { value: values[rowIndex] ?? "", kind } satisfies ExcelCellModel,
      ]);
    }

    if (op.op === "delete_row") {
      sheet.rows = sheet.rows.filter((_, i) => i !== op.rowIndex);
    }

    if (op.op === "delete_rows") {
      const remove = new Set(op.rowIndexes);
      sheet.rows = sheet.rows.filter((_, i) => !remove.has(i));
    }

    if (op.op === "set_fill") {
      // range like "A2:C2" — apply to intersecting body cells approximately
      const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i.exec(op.range.trim());
      if (m) {
        const r1 = Number(m[2]);
        const r2 = Number(m[4]);
        const origin = tableOrigin(Boolean(sheet.title));
        sheet.rows = sheet.rows.map((row, offset) => {
          const excelRow = origin.firstDataRow + offset;
          if (excelRow < r1 || excelRow > r2) return row;
          return row.map((cell) => ({ ...cell, fillArgb: op.fillArgb }));
        });
      }
    }

    if (op.op === "add_sum") {
      const colIndex = sheet.columns.findIndex(
        (c) => c.key === op.columnKey || c.header === op.columnKey,
      );
      if (colIndex >= 0) {
        const origin = tableOrigin(Boolean(sheet.title));
        const bodyRows = sheet.rows.filter((row) => row[0]?.value !== "合計");
        const total = buildAutoTotalRow({
          columns: sheet.columns,
          firstDataRow: origin.firstDataRow,
          lastDataRow: origin.firstDataRow + bodyRows.length - 1,
        });
        sheet.rows = [...bodyRows, total];
      }
    }

    if (op.op === "set_formula") {
      const addr = /^([A-Z]+)(\d+)$/i.exec(op.address.trim());
      if (addr) {
        let col = 0;
        for (const ch of addr[1]!.toUpperCase()) {
          col = col * 26 + (ch.charCodeAt(0) - 64);
        }
        const excelRow = Number(addr[2]);
        const origin = tableOrigin(Boolean(sheet.title));
        const rowIndex = excelRow - origin.firstDataRow;
        if (rowIndex >= 0 && rowIndex < sheet.rows.length) {
          const row = [...sheet.rows[rowIndex]!];
          row[col - 1] = {
            ...(row[col - 1] ?? {}),
            formula: op.formula.replace(/^=/, ""),
            kind: "formula",
          };
          sheet.rows[rowIndex] = row;
        }
      }
    }

    if (op.op === "add_filter") {
      sheet.asTable = true;
      sheet.freezeHeader = true;
    }

    next.sheets[idx] = sheet;
  }

  return next;
}

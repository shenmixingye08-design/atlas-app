import { z } from "zod";

import { EXCEL_LIMITS } from "./limits";
import { validateWorkbookFormulas } from "./formula-validate";
import type { ExcelWorkbookModel } from "./types";

const cellSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.date(), z.null()]).optional(),
  formula: z.string().optional(),
  kind: z
    .enum([
      "text",
      "number",
      "currency",
      "percent",
      "date",
      "datetime",
      "formula",
      "boolean",
    ])
    .optional(),
  numFmt: z.string().optional(),
  bold: z.boolean().optional(),
  fillArgb: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  originalText: z.string().optional(),
  needsReview: z.boolean().optional(),
});

const columnSchema = z.object({
  key: z.string().min(1),
  header: z.string().min(1),
  kind: z.enum([
    "text",
    "number",
    "currency",
    "percent",
    "date",
    "datetime",
    "formula",
    "boolean",
  ]),
  width: z.number().positive().optional(),
});

const sheetSchema = z.object({
  name: z.string().min(1).max(31),
  columns: z.array(columnSchema).min(1).max(EXCEL_LIMITS.maxColumns),
  rows: z.array(z.array(cellSchema)).max(EXCEL_LIMITS.maxRowsPerSheet),
  title: z.string().nullable().optional(),
  freezeHeader: z.boolean().optional(),
  asTable: z.boolean().optional(),
  tableName: z.string().optional(),
  printLandscape: z.boolean().optional(),
  charts: z
    .array(
      z.object({
        type: z.enum(["bar", "column", "line", "pie", "stacked", "scatter"]),
        title: z.string(),
        categoriesRange: z.string(),
        series: z.array(
          z.object({ name: z.string(), valuesRange: z.string() }),
        ),
        anchor: z.string().optional(),
      }),
    )
    .optional(),
});

export const excelWorkbookSchema = z.object({
  kind: z.string(),
  title: z.string().min(1),
  sheets: z.array(sheetSchema).min(1).max(EXCEL_LIMITS.maxSheets),
  creator: z.string().optional(),
  purpose: z.string().optional(),
  locale: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional(),
});

export type ExcelSchemaValidation = {
  ok: boolean;
  errors: string[];
  formulaIssues: ReturnType<typeof validateWorkbookFormulas>;
};

/** Validate structured workbook before binary generation. */
export function validateExcelWorkbookModel(
  model: ExcelWorkbookModel,
): ExcelSchemaValidation {
  const parsed = excelWorkbookSchema.safeParse(model);
  const errors: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues.slice(0, 20)) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }

  const names = model.sheets.map((s) => s.name);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) {
    errors.push(`重複シート名: ${[...new Set(dup)].join(", ")}`);
  }

  for (const sheet of model.sheets) {
    if (sheet.rows.length > EXCEL_LIMITS.maxRowsPerSheet) {
      errors.push(
        `${sheet.name}: 行数上限 ${EXCEL_LIMITS.maxRowsPerSheet} を超えています`,
      );
    }
    if (sheet.columns.length > EXCEL_LIMITS.maxColumns) {
      errors.push(`${sheet.name}: 列数上限を超えています`);
    }
  }

  const formulaIssues = validateWorkbookFormulas(model);
  const blocking = formulaIssues.filter(
    (i) => i.code === "circular_risk" || i.code === "empty_formula",
  );
  for (const issue of blocking.slice(0, 10)) {
    errors.push(`${issue.sheet}!${issue.cell}: ${issue.message}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    formulaIssues,
  };
}

/** Excel Secretary workbook model — AI-facing structure, not exceljs internals. */

export type ExcelWorkbookKind =
  | "sales"
  | "sales_pipeline"
  | "household"
  | "process"
  | "attendance"
  | "shift"
  | "customers"
  | "inventory"
  | "vehicle"
  | "daily_report"
  | "estimate"
  | "invoice"
  | "receipt"
  | "invoice_list"
  | "cashflow"
  | "survey"
  | "tasks"
  | "realestate"
  | "solar"
  | "gantt"
  | "timecard"
  | "schedule"
  | "generic_table"
  | "from_image"
  | "from_pdf"
  | "from_word"
  | "from_csv"
  | "edited"
  | "analysis";

export type ExcelCellKind =
  | "text"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "datetime"
  | "formula"
  | "boolean";

export type ExcelCellValue = string | number | boolean | Date | null;

export type ExcelCellModel = {
  value?: ExcelCellValue;
  formula?: string;
  kind?: ExcelCellKind;
  /** exceljs numFmt */
  numFmt?: string;
  bold?: boolean;
  fillArgb?: string;
  align?: "left" | "center" | "right";
  merge?: { rowSpan?: number; colSpan?: number };
  /** Vision / OCR confidence 0–1 */
  confidence?: number;
  originalText?: string;
  needsReview?: boolean;
};

export type ExcelColumnModel = {
  key: string;
  header: string;
  kind: ExcelCellKind;
  width?: number;
};

export type ExcelChartType =
  | "bar"
  | "column"
  | "line"
  | "pie"
  | "stacked"
  | "scatter";

export type ExcelChartSpec = {
  type: ExcelChartType;
  title: string;
  /** 1-based sheet data range like "B2:B13" */
  categoriesRange: string;
  series: Array<{ name: string; valuesRange: string }>;
  /** Anchor cell e.g. "E2" */
  anchor?: string;
};

export type ExcelSheetModel = {
  name: string;
  columns: ExcelColumnModel[];
  /** Body rows as cells (excluding header). */
  rows: ExcelCellModel[][];
  /** Optional title above the table (merged). */
  title?: string | null;
  /** Freeze header row (default true when table). */
  freezeHeader?: boolean;
  /** Excel Table + autofilter. */
  asTable?: boolean;
  tableName?: string;
  /** Print settings. */
  printLandscape?: boolean;
  /** Charts to attach (data must already be on sheet). */
  charts?: ExcelChartSpec[];
  /** Extra freeform cells (absolute positions). */
  absoluteCells?: Array<{
    row: number;
    col: number;
    cell: ExcelCellModel;
  }>;
};

export type ExcelWorkbookModel = {
  kind: ExcelWorkbookKind;
  title: string;
  sheets: ExcelSheetModel[];
  creator?: string;
  purpose?: string;
  locale?: string;
  warnings?: string[];
  assumptions?: string[];
  /** Pipeline stage breadcrumbs for UI errors. */
  stages?: ExcelPipelineStage[];
};

export type ExcelPipelineStage =
  | "intent"
  | "image_analysis"
  | "ai_analysis"
  | "table_extract"
  | "excel_build"
  | "formula"
  | "chart"
  | "persist"
  | "download"
  | "edit"
  | "analyze";

export type ExcelStageError = {
  stage: ExcelPipelineStage;
  code: string;
  message: string;
  retriable: boolean;
};

export type ExcelSecretaryResult = {
  ok: boolean;
  workbook: ExcelWorkbookModel | null;
  buffer: Buffer | null;
  fileName: string;
  errors: ExcelStageError[];
  warnings: string[];
  /** Preview JSON for UI (no binary). */
  preview: ExcelPreviewPayload | null;
};

export type ExcelPreviewPayload = {
  title: string;
  kind: ExcelWorkbookKind;
  sheets: Array<{
    name: string;
    headers: string[];
    rows: string[][];
    rowCount: number;
    columnCount: number;
  }>;
  activeSheetIndex: number;
};

export type ExcelEditOperation =
  | { op: "add_column"; sheet?: string; header: string; kind?: ExcelCellKind; values?: ExcelCellValue[] }
  | { op: "delete_row"; sheet?: string; rowIndex: number }
  | { op: "delete_rows"; sheet?: string; rowIndexes: number[] }
  | { op: "set_fill"; sheet?: string; range: string; fillArgb: string }
  | { op: "add_sum"; sheet?: string; columnKey: string }
  | { op: "set_formula"; sheet?: string; address: string; formula: string }
  | { op: "rename_sheet"; from: string; to: string }
  | { op: "add_filter"; sheet?: string };

export type ExcelAnalysisResult = {
  summary: string;
  rankings: Array<{ label: string; value: number }>;
  anomalies: Array<{ sheet: string; row: number; message: string }>;
  yearOverYear: Array<{ label: string; current: number; previous: number; deltaPct: number }> | null;
  comments: string[];
};

export { EXCEL_SECRETARY_FEATURE_EVALUATION } from "./feature-evaluation";
export { detectExcelIntent } from "./detect-intent";
export { buildTemplateWorkbook } from "./templates";
export { ExcelSecretaryError } from "./errors";
export {
  createExcelFromAssignment,
  createExcelFromVisionTables,
  createExcelFromUpload,
  editExcelBuffer,
  analyzeExcelBuffer,
  convertExcelExport,
} from "./service";
export { analyzeWorkbookModel } from "./analyze-workbook";
export { applyExcelEdits } from "./edit-workbook";
export {
  exportWorkbook,
  workbookModelFromXlsxBuffer,
  workbookToMarkdown,
  previewWorkbook,
} from "./export";
export {
  writeWorkbookBuffer,
  toPreviewPayload,
  buildExcelJsWorkbook,
} from "./build-workbook";
export {
  workbookFromCsv,
  workbookFromMarkdownTables,
  workbookFromMatrix,
} from "./from-tabular";
export { validateExcelWorkbookModel } from "./schema";
export { validateWorkbookFormulas } from "./formula-validate";
export { EXCEL_LIMITS, classifyExcelScale } from "./limits";
export {
  sanitizeCsvCell,
  sanitizeExcelFileName,
  headerRequiresText,
} from "./security";
export {
  excelPhaseLabel,
  userMessageForExcelCode,
  EXCEL_JOB_PHASES,
} from "./job-phase";
export type { ExcelJobPhase, ExcelUserErrorCode } from "./job-phase";
export type {
  ExcelWorkbookModel,
  ExcelSheetModel,
  ExcelPreviewPayload,
  ExcelSecretaryResult,
  ExcelEditOperation,
  ExcelAnalysisResult,
  ExcelStageError,
  ExcelWorkbookKind,
  ExcelPipelineStage,
} from "./types";

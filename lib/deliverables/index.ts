export type {
  Deliverable,
  DeliverableFormat,
  DeliverableFormatDetection,
  DeliverableGenerator,
  GenerateDeliverablesInput,
  GeneratedDeliverableFile,
} from "./types";

export {
  DELIVERABLE_EXTENSIONS,
  DELIVERABLE_FORMAT_LABELS,
  DELIVERABLE_MIME_TYPES,
} from "./types";

export { detectDeliverableFormats } from "./detect-formats";
export { buildDeliverableBaseName, buildFileName } from "./filename";

export {
  DocxDeliverableGenerator,
  DocxPlaceholderGenerator,
  MarkdownDeliverableGenerator,
  PdfDeliverableGenerator,
  PlainTextDeliverableGenerator,
  PptxDeliverableGenerator,
  PptxPlaceholderGenerator,
  XlsxDeliverableGenerator,
  defaultDeliverableGenerators,
  getDeliverableGenerator,
} from "./generators";

export {
  assignmentIsImageToExcel,
  assignmentRequestsExcel,
  contentHasMarkdownTable,
  extractExcelSheets,
  shouldGenerateXlsx,
} from "./excel-data";

export { parseDeliverableContent } from "./parse-content";
export type {
  ContentBlock,
  ParsedDeliverable,
  ParsedSection,
} from "./parse-content";

export type { GenerateDeliverablesResult } from "./engine";
export { generateDeliverables } from "./engine";

export {
  DELIVERABLE_MEMORY_TTL_MS,
  DELIVERABLE_METADATA_TTL_MS,
  ATLAS_DELIVERABLE_FILES_BUCKET,
} from "./constants";

export {
  validateWordSourceContent,
  generateQualityWordContent,
} from "./content-quality";

export {
  userMessageForFailure,
  recoveryActionsForFailure,
  classifyDeliverableError,
} from "./recovery-messages";

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

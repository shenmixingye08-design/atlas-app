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
  defaultDeliverableGenerators,
  getDeliverableGenerator,
} from "./generators";

export { parseDeliverableContent } from "./parse-content";
export type {
  ContentBlock,
  ParsedDeliverable,
  ParsedSection,
} from "./parse-content";

export {
  DEFAULT_DESIGN_TEMPLATE,
  DESIGN_TEMPLATE_IDS,
  DOCUMENT_TYPE_LABELS,
  buildDocumentOutline,
  buildStructuredDocument,
  detectDocumentType,
  getDocumentTheme,
  listDocumentThemes,
} from "./document-model";
export type {
  DesignTemplateId,
  DocumentType,
  StructuredDocument,
} from "./document-model";

export type { GenerateDeliverablesResult } from "./engine";
export { generateDeliverables } from "./engine";

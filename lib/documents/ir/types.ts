/** @deprecated Use `@/lib/documents/schema/enums` and `@/lib/documents/schema/document-model.zod`. */
export type {
  DocumentType,
  TemplateId,
  OutputFormat as RenderFormat,
} from "@/lib/documents/schema/enums";

export type {
  DocumentModel as DocumentIR,
  DocumentSection,
  SectionBlock,
} from "@/lib/documents/schema/document-model.zod";

export { normalizeToDocumentModel as parseLegacyDocumentText } from "@/lib/documents/normalize";
export { documentModelToMarkdown as renderDocumentIRToText } from "@/lib/documents/normalize";
export { templateForDocumentType as getDocumentTemplateId } from "@/lib/documents/templates/registry";

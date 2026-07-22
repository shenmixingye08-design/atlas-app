export type {
  DocumentModel,
  DocumentSection,
  SectionBlock,
  ActionItem,
  SourceReference,
} from "./schema/document-model.zod";
export {
  documentModelSchema,
  parseDocumentModel,
} from "./schema/document-model.zod";
export type {
  DocumentType,
  TemplateId,
  OutputFormat,
} from "./schema/enums";
export { normalizeToDocumentModel, documentModelToMarkdown } from "./normalize";
export { detectDocumentType } from "./classify/detect-document-type";
export {
  recommendOutputFormat,
  resolveFormatsFromRecommendation,
} from "./classify/recommend-format";
export { renderDocumentModelToHtml } from "./render/render-to-html";
export { templateForDocumentType, TEMPLATE_LABELS } from "./templates/registry";
export { DESIGN_TOKENS } from "./tokens/design-tokens";

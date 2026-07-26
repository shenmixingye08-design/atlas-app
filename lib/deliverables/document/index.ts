export type {
  DocumentSection,
  NormalizeResult,
  NormalizeWarning,
  SourceFormat,
  StructuredDocument,
  StructuredDocumentMetadata,
} from "./types"
export {
  CANONICAL_HTML_VERSION,
  RENDERER_VERSION,
  STRUCTURED_DOCUMENT_VERSION,
} from "./types"
export {
  normalizeToStructuredDocument,
  structuredDocumentToMarkdown,
} from "./normalize"
export { parseJsonDeliverable } from "./parse-json"
export { parseMarkdownToSections, plainTextToSections } from "./parse-markdown"
export { sanitizeText, unescapeLiteralEscapes } from "./sanitize"
export {
  extractVisibleTextFromHtml,
  renderCanonicalHtml,
} from "./html-renderer"
export {
  documentPlainTextLength,
  validateCanonicalHtml,
} from "./validator"

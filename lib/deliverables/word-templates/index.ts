export {
  WORD_TEMPLATE_IDS,
  WORD_TEMPLATES,
  getWordTemplate,
  listWordTemplates,
  isWordTemplateId,
  type WordTemplateId,
  type WordPurpose,
  type WordTemplateDefinition,
  type WordDateFormat,
  type WordColorTheme,
  type WordTypography,
  type WordMarginsDxa,
  type WordPageBreakRule,
} from "./registry";

export {
  detectWordPurpose,
  type PurposeDetectionResult,
} from "./detect-purpose";

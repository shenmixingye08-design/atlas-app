export { listPptxTemplates, getPptxTemplate, findPptxTemplate, isPptxTemplateId } from "./registry";
export { resolvePptxDesign, type ResolvePptxDesignInput } from "./resolve";
export {
  injectPptxThemeAccent,
  inspectPptxDesignParts,
} from "./theme-ooxml";
export {
  PPTX_TEMPLATE_IDS,
  type PptxTemplateId,
  type PptxTemplateDefinition,
  type ResolvedPptxDesign,
  type PptxAutomationTheme,
} from "./types";

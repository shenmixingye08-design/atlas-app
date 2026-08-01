export { PPTX_SECRETARY_FEATURE_EVALUATION } from "./feature-evaluation";
export { detectPptxIntent } from "./detect-intent";
export { buildPresentationFromIntent } from "./outlines";
export { validatePresentationModel } from "./schema";
export { writePptxBuffer, toPreviewPayload } from "./build-pptx";
export { applyPptxEdits } from "./edit";
export { resolveTheme, themeForKind, PPTX_SAFE_FONT } from "./themes";
export {
  createPptxFromAssignment,
  createPptxFromUpload,
  editPptxPresentation,
  convertPresentationToPdf,
  presentationToMarkdown,
} from "./service";
export {
  presentationFromAssignment,
  presentationFromMarkdown,
  presentationFromDocx,
  presentationFromPdf,
  presentationFromXlsx,
} from "./from-sources";
export { PPTX_LIMITS, classifyPptxScale, pptxScaleGuidance } from "./limits";
export {
  pptxPhaseLabel,
  userMessageForPptxCode,
  PPTX_JOB_PHASES,
} from "./job-phase";
export { sanitizePptxFileName, looksLikePptxZip } from "./security";
export { PptxSecretaryError } from "./errors";
export type {
  PresentationModel,
  PresentationKind,
  ThemeId,
  PptxPreviewPayload,
  PptxSecretaryResult,
  PptxEditOperation,
  BrandConfig,
} from "./types";
export type { PptxJobPhase, PptxUserErrorCode } from "./job-phase";

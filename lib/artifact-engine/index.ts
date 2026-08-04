export type {
  ArtifactDetection,
  ArtifactFormatPlan,
  ArtifactPreviewBlock,
  ArtifactPreviewModel,
  ArtifactPreviewSection,
  ArtifactSuggestion,
  ArtifactSuggestionKind,
  ArtifactType,
} from "./types";
export { ARTIFACT_TYPE_LABELS } from "./types";

export type {
  ArtifactBlock,
  ArtifactCompletionStatus,
  ArtifactDocument,
  ArtifactFormatState,
  ArtifactMissingField,
  ArtifactSection,
  ArtifactStructurePlan,
} from "./document";

export {
  artifactTypeToDocumentType,
  detectArtifactType,
} from "./detect-artifact-type";
export { recommendArtifactFormats } from "./recommend-formats";
export {
  buildArtifactSuggestions,
  type BuildArtifactSuggestionsInput,
} from "./build-suggestions";
export { buildArtifactPreview } from "./build-preview";
export { buildArtifactDocument } from "./build-document";
export {
  analyzeArtifact,
  type AnalyzeArtifactInput,
  type AnalyzeArtifactResult,
} from "./analyze";
export {
  artifactTypeToLearningDomain,
  buildArtifactLearningHint,
  type ArtifactLearningHint,
} from "./learning-bridge";
export {
  ARTIFACT_TEMPLATE_IDS,
  DEFAULT_ARTIFACT_TEMPLATE,
  getArtifactTemplate,
  listArtifactTemplates,
  listSelectableTemplates,
  selectArtifactTemplate,
  type ArtifactTemplateId,
  type TemplateCategory,
} from "./templates";
export {
  loadOrgAssistProfile,
  saveOrgAssistProfile,
  type OrgAssistProfile,
} from "./org-assist-store";
export { buildExcelPayload, resolveExcelSchema } from "./excel-schema";
export {
  buildFormatStates,
  formatPurpose,
  formatShortLabel,
  resolveCompletionStatus,
} from "./completion";

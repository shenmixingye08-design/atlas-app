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

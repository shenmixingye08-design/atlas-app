export type {
  ArtifactTemplateDefinition,
  ArtifactTemplateId,
  TemplateCategory,
  TemplateMatchContext,
} from "./types";
export {
  ARTIFACT_TEMPLATE_IDS,
  DEFAULT_ARTIFACT_TEMPLATE,
} from "./types";
export {
  ARTIFACT_TEMPLATES,
  CATEGORY_BY_ARTIFACT_TYPE,
  getArtifactTemplate,
  listArtifactTemplates,
  listSelectableTemplates,
} from "./registry";
export { selectArtifactTemplate, type TemplateSelection } from "./select";

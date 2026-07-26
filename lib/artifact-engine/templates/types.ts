/**
 * Extensible template categories — register new templates in the registry
 * instead of growing hard-coded switch branches.
 */
export type TemplateCategory =
  | "business"
  | "proposal"
  | "sales"
  | "report"
  | "meeting"
  | "contract"
  | "invoice"
  | "estimate"
  | "ranking"
  | "research"
  | "manual"
  | "creator"
  | "spreadsheet"
  | "simple";

/** User-facing / design template ids (also used as DesignTemplateId bridge). */
export type ArtifactTemplateId =
  | "business"
  | "simple"
  | "report"
  | "proposal"
  | "a4_leaflet"
  | "table_focus"
  | "standard";

export type TemplateMatchContext = {
  assignment: string;
  content: string;
  title?: string;
  artifactType: string;
};

export type ArtifactTemplateDefinition = {
  id: ArtifactTemplateId;
  category: TemplateCategory;
  label: string;
  description: string;
  /** Higher wins when multiple templates match. */
  baseWeight: number;
  /** Pattern matchers against assignment+content+title. */
  patterns: RegExp[];
  /** Artifact types that prefer this template. */
  preferredArtifactTypes: readonly string[];
  structureDefaults: {
    cover: boolean;
    toc: "auto" | "always" | "never";
    summary: boolean;
    contact: boolean;
    signature: boolean;
    imageFrames: boolean;
    charts: boolean;
    pageBreaks: boolean;
    cta: boolean;
    pageNumbers: boolean;
    header: boolean;
    footer: boolean;
  };
  recommendedFormats: readonly string[];
  otherFormats: readonly string[];
};

export const ARTIFACT_TEMPLATE_IDS: readonly ArtifactTemplateId[] = [
  "business",
  "simple",
  "report",
  "proposal",
  "a4_leaflet",
  "table_focus",
  "standard",
] as const;

export const DEFAULT_ARTIFACT_TEMPLATE: ArtifactTemplateId = "business";

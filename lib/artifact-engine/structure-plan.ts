import type { ArtifactStructurePlan } from "./document";
import type { ArtifactTemplateDefinition } from "./templates/types";
import type { ArtifactType } from "./types";

const TOC_ARTIFACT_TYPES = new Set<ArtifactType>([
  "plan",
  "proposal",
  "report",
  "research",
  "manual",
]);

const NO_TOC_TYPES = new Set<ArtifactType>([
  "invoice",
  "sns",
  "blog",
  "list",
  "household",
  "schedule",
  "contract",
]);

export type StructurePlanInput = {
  artifactType: ArtifactType;
  template: ArtifactTemplateDefinition;
  headingCount: number;
  hasTables: boolean;
  hasImages: boolean;
  contentLength: number;
  userForceToc?: boolean;
};

function estimatePages(contentLength: number, headingCount: number): number {
  const byLength = Math.ceil(Math.max(contentLength, 1) / 900);
  const byHeadings = Math.ceil(headingCount / 2);
  return Math.max(1, byLength, byHeadings);
}

/**
 * Decide cover / TOC / contact / etc. after template selection.
 * TOC is never unconditional — uses template policy + heuristics.
 */
export function buildStructurePlan(
  input: StructurePlanInput,
): ArtifactStructurePlan {
  const defaults = input.template.structureDefaults;
  const estimatedPages = estimatePages(input.contentLength, input.headingCount);

  let toc = false;
  if (input.userForceToc) {
    toc = true;
  } else if (defaults.toc === "always") {
    toc = true;
  } else if (defaults.toc === "never") {
    toc = false;
  } else {
    // auto
    const tocCandidate =
      estimatedPages >= 3 ||
      input.headingCount >= 3 ||
      TOC_ARTIFACT_TYPES.has(input.artifactType);
    toc =
      tocCandidate &&
      !NO_TOC_TYPES.has(input.artifactType) &&
      input.template.id !== "a4_leaflet" &&
      input.template.id !== "table_focus";
  }

  return {
    cover: defaults.cover && input.artifactType !== "sns",
    toc,
    summary: defaults.summary,
    tables: input.hasTables || defaults.charts,
    imageFrames:
      defaults.imageFrames ||
      input.hasImages ||
      /写真|画像|イメージ/.test(input.template.id),
    charts: defaults.charts && input.hasTables,
    notes: true,
    contact: defaults.contact,
    signature: defaults.signature || input.artifactType === "contract",
    pageNumbers: defaults.pageNumbers,
    header: defaults.header,
    footer: defaults.footer,
    pageBreaks: defaults.pageBreaks && estimatedPages >= 2,
    cta: defaults.cta,
    estimatedPages,
    headingCount: input.headingCount,
  };
}

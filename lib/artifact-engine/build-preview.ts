import { buildArtifactDocument } from "./build-document";
import type { OrgAssistProfile } from "./org-assist-store";
import type { ArtifactTemplateId } from "./templates/types";
import type { ArtifactPreviewModel, ArtifactPreviewSection } from "./types";

/**
 * Build a screen preview model from deliverable text.
 * Uses ArtifactDocument IR — never raw Markdown / JSON.
 */
export function buildArtifactPreview(input: {
  assignment: string;
  content: string;
  title?: string;
  templateOverride?: ArtifactTemplateId;
  orgProfile?: OrgAssistProfile | null;
}): ArtifactPreviewModel {
  const document = buildArtifactDocument({
    assignment: input.assignment,
    content: input.content,
    title: input.title,
    templateOverride: input.templateOverride,
    orgProfile: input.orgProfile,
  });

  const sections: ArtifactPreviewSection[] = document.sections.map((section) => ({
    title: section.title,
    level: section.level,
    pageBreakBefore: section.pageBreakBefore,
    blocks: section.blocks,
  }));

  return {
    artifactType: document.artifactType,
    artifactLabel: document.artifactLabel,
    documentTypeLabel: document.templateCategory,
    templateLabel: document.templateLabel,
    designId: document.designId,
    title: document.title,
    subtitle: document.subtitle,
    summary: document.summary,
    metaFields: document.metadata.fields,
    toc: document.structure.toc
      ? document.sections
          .filter((section) => section.level <= 2)
          .map((section) => section.title)
      : [],
    showCover: document.structure.cover,
    showHeader: document.structure.header,
    showFooter: document.structure.footer,
    showPageNumbers: document.structure.pageNumbers,
    sections,
    completionStatus: document.completionStatus,
  };
}

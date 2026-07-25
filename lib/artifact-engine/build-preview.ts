import {
  DOCUMENT_TYPE_LABELS,
  buildStructuredDocument,
  type DocumentBlock,
} from "@/lib/deliverables/document-model";

import { detectArtifactType } from "./detect-artifact-type";
import type {
  ArtifactPreviewBlock,
  ArtifactPreviewModel,
  ArtifactPreviewSection,
} from "./types";

function toPreviewBlock(block: DocumentBlock): ArtifactPreviewBlock | null {
  switch (block.type) {
    case "paragraph":
      if (!block.text.trim()) return null;
      return { type: "paragraph", text: block.text.trim() };
    case "bulletList": {
      const items = block.items.map((item) => item.trim()).filter(Boolean);
      return items.length ? { type: "bulletList", items } : null;
    }
    case "numberedList": {
      const items = block.items.map((item) => item.trim()).filter(Boolean);
      return items.length ? { type: "numberedList", items } : null;
    }
    case "table":
      return {
        type: "table",
        headers: block.headers,
        rows: block.rows,
      };
    case "callout":
      return {
        type: "callout",
        variant: block.variant,
        text: block.text.trim(),
      };
    case "imagePlaceholder":
      return {
        type: "imagePlaceholder",
        caption: block.caption.trim() || "画像",
      };
    case "keyCard":
      return {
        type: "keyCard",
        title: block.title,
        items: block.items.map((item) => item.trim()).filter(Boolean),
      };
    default:
      return null;
  }
}

/**
 * Build a screen preview model from deliverable text.
 * Strips Markdown chrome via the layout engine — safe for client use.
 */
export function buildArtifactPreview(input: {
  assignment: string;
  content: string;
  title?: string;
}): ArtifactPreviewModel {
  const detection = detectArtifactType({
    assignment: input.assignment,
    content: input.content,
    title: input.title,
  });

  const structured = buildStructuredDocument({
    content: input.content,
    assignment: input.assignment,
    title: input.title,
    authorLabel: "MINERVOT",
  });

  const sections: ArtifactPreviewSection[] = structured.sections.map(
    (section) => ({
      title: section.title,
      level: section.level,
      blocks: section.blocks
        .map(toPreviewBlock)
        .filter((block): block is ArtifactPreviewBlock => Boolean(block)),
    }),
  );

  return {
    artifactType: detection.artifactType,
    artifactLabel: detection.label,
    documentTypeLabel: DOCUMENT_TYPE_LABELS[structured.documentType],
    title: structured.title,
    subtitle: structured.subtitle,
    metaFields: structured.meta.fields,
    toc: structured.includeTableOfContents
      ? structured.sections
          .filter((section) => section.level <= 2)
          .map((section) => section.title)
      : [],
    sections,
  };
}

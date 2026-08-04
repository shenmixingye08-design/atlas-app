import type { DocumentModel } from "./document-model/document-model-schema";
import { estimatePageCount } from "./generators/docx-renderer";
import { getWordTemplate, type WordTemplateId } from "./word-templates";

export type WordPreviewModel = {
  title: string;
  subtitle?: string;
  templateId: WordTemplateId;
  templateName: string;
  createdAt?: string;
  author?: string;
  companyName?: string;
  recipient?: string;
  sections: Array<{
    id: string;
    level: number;
    title: string;
    blocks: DocumentModel["sections"][number]["blocks"];
  }>;
  estimatedPages: number;
  sizeBytes?: number;
  version?: number;
  isLatest?: boolean;
  status: "ready" | "generating" | "failed";
};

/**
 * Build a safe preview from DocumentModel — never converts docx→HTML.
 * Consumers must sanitize if rendering any HTML wrappers.
 */
export function buildWordPreviewModel(input: {
  model: DocumentModel;
  sizeBytes?: number;
  version?: number;
  isLatest?: boolean;
  status?: "ready" | "generating" | "failed";
}): WordPreviewModel {
  const template = getWordTemplate(input.model.templateId);
  return {
    title: input.model.title,
    subtitle: input.model.subtitle,
    templateId: input.model.templateId,
    templateName: template.displayName,
    createdAt: input.model.createdAt,
    author: input.model.author,
    companyName: input.model.companyName,
    recipient: input.model.recipient,
    sections: input.model.sections.map((section) => ({
      id: section.id,
      level: section.level,
      title: section.title,
      blocks: section.blocks,
    })),
    estimatedPages: estimatePageCount(input.model),
    sizeBytes: input.sizeBytes,
    version: input.version,
    isLatest: input.isLatest,
    status: input.status ?? "ready",
  };
}

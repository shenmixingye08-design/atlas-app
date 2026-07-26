import "server-only";

import { analyzeArtifact } from "@/lib/artifact-engine/analyze";
import type { ArtifactDocument } from "@/lib/artifact-engine/document";
import type { ArtifactSuggestion } from "@/lib/artifact-engine/types";
import type { ArtifactTemplateId } from "@/lib/artifact-engine/templates/types";

import {
  DEFAULT_DESIGN_TEMPLATE,
  buildDocumentOutline,
  type DesignTemplateId,
} from "./document-model";
import { detectDeliverableFormats } from "./detect-formats";
import { buildDeliverableBaseName } from "./filename";
import { getDeliverableGenerator } from "./generators";
import { saveDeliverableFile, toDeliverableMetadata } from "./store";
import type {
  Deliverable,
  DeliverableFormat,
  GenerateDeliverablesInput,
} from "./types";

export type GenerateDeliverablesResult = {
  deliverables: Deliverable[];
  detection: ReturnType<typeof detectDeliverableFormats>;
  documentOutline: ReturnType<typeof buildDocumentOutline>;
  designTemplate: DesignTemplateId;
  artifactType: string;
  artifactLabel: string;
  templateLabel: string;
  suggestions: ArtifactSuggestion[];
  artifactDocument: ArtifactDocument;
  completionStatus: ArtifactDocument["completionStatus"];
  formatStates: ArtifactDocument["formatStates"];
};

function toDesignId(value?: string): DesignTemplateId {
  const allowed = new Set([
    "standard",
    "simple",
    "business",
    "report",
    "proposal",
    "a4_leaflet",
    "table_focus",
  ]);
  if (value && allowed.has(value)) return value as DesignTemplateId;
  return DEFAULT_DESIGN_TEMPLATE;
}

/**
 * Deliverables Engine — Artifact Generation Engine + file generators.
 */
export async function generateDeliverables(
  input: GenerateDeliverablesInput,
  requestOrigin: string,
  options: { userId: string },
): Promise<GenerateDeliverablesResult> {
  const content = input.finalDeliverable.trim();
  const designTemplate = toDesignId(input.designTemplate);

  if (!options.userId.trim()) {
    throw new Error("userId is required to generate deliverables");
  }

  const analysis = analyzeArtifact({
    assignment: input.assignment,
    content: content || "",
    title: input.title,
    formatsOverride: input.formats,
    designTemplate: designTemplate as ArtifactTemplateId,
  });

  const documentOutline = buildDocumentOutline({
    content: content || "",
    assignment: input.assignment,
    title: input.title,
    designTemplate,
    includeTableOfContents: analysis.document.structure.toc,
  });

  if (!content) {
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
      documentOutline,
      designTemplate,
      artifactType: analysis.detection.artifactType,
      artifactLabel: analysis.detection.label,
      templateLabel: analysis.detection.templateLabel,
      suggestions: analysis.suggestions,
      artifactDocument: analysis.document,
      completionStatus: analysis.document.completionStatus,
      formatStates: analysis.document.formatStates,
    };
  }

  const formats = analysis.detection.formatPlan.formats;
  const baseFileName = buildDeliverableBaseName(
    input.assignment,
    input.title,
  );

  const deliverables: Deliverable[] = [];
  const failedFormats: DeliverableFormat[] = [];
  const generateOptions = {
    assignment: input.assignment,
    title: input.title,
    designTemplate,
    authorLabel: "MINERVOT",
    includeTableOfContents: analysis.document.structure.toc,
    artifactType: analysis.detection.artifactType,
  };

  for (const format of formats) {
    if (format === "xlsx" && analysis.document.excelNotApplicable) {
      continue;
    }

    const generator = getDeliverableGenerator(format);
    if (!generator) continue;

    try {
      const file = await generator.generate(content, baseFileName, generateOptions);
      if (!file.buffer || file.buffer.length === 0) {
        failedFormats.push(format);
        continue;
      }
      const stored = saveDeliverableFile(file, options.userId);
      deliverables.push(toDeliverableMetadata(stored, requestOrigin));
    } catch (error) {
      console.error(`[generateDeliverables] ${format} failed`, error);
      failedFormats.push(format);
    }
  }

  const finalAnalysis = analyzeArtifact({
    assignment: input.assignment,
    content,
    title: input.title,
    formatsOverride: input.formats,
    designTemplate: designTemplate as ArtifactTemplateId,
    generatedFiles: deliverables.map((item) => ({
      format: item.format,
      downloadUrl: item.downloadUrl,
      fileName: item.fileName,
      sizeBytes: item.sizeBytes,
    })),
    failedFormats,
  });

  return {
    deliverables,
    detection: {
      formats: finalAnalysis.detection.formatPlan.formats,
      matchedRule: finalAnalysis.detection.formatPlan.matchedRule,
    },
    documentOutline,
    designTemplate,
    artifactType: finalAnalysis.detection.artifactType,
    artifactLabel: finalAnalysis.detection.label,
    templateLabel: finalAnalysis.detection.templateLabel,
    suggestions: finalAnalysis.suggestions,
    artifactDocument: finalAnalysis.document,
    completionStatus: finalAnalysis.document.completionStatus,
    formatStates: finalAnalysis.document.formatStates,
  };
}

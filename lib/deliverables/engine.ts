import "server-only";

import { analyzeArtifact } from "@/lib/artifact-engine/analyze";
import type { ArtifactSuggestion } from "@/lib/artifact-engine/types";

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
  GenerateDeliverablesInput,
} from "./types";

export type GenerateDeliverablesResult = {
  deliverables: Deliverable[];
  detection: ReturnType<typeof detectDeliverableFormats>;
  documentOutline: ReturnType<typeof buildDocumentOutline>;
  designTemplate: DesignTemplateId;
  artifactType: string;
  artifactLabel: string;
  suggestions: ArtifactSuggestion[];
};

/**
 * Deliverables Engine — runs after orchestration completes.
 * Uses the Artifact Generation Engine for type/format/suggestion analysis,
 * then converts text into downloadable files server-side.
 */
export async function generateDeliverables(
  input: GenerateDeliverablesInput,
  requestOrigin: string,
  options: { userId: string },
): Promise<GenerateDeliverablesResult> {
  const content = input.finalDeliverable.trim();
  const designTemplate = input.designTemplate ?? DEFAULT_DESIGN_TEMPLATE;

  if (!options.userId.trim()) {
    throw new Error("userId is required to generate deliverables");
  }

  if (!content) {
    const emptyAnalysis = analyzeArtifact({
      assignment: input.assignment,
      content: "",
      title: input.title,
      formatsOverride: input.formats,
      designTemplate,
    });
    return {
      deliverables: [],
      detection: detectDeliverableFormats(input.assignment),
      documentOutline: buildDocumentOutline({
        content: "",
        assignment: input.assignment,
        title: input.title,
        designTemplate,
      }),
      designTemplate,
      artifactType: emptyAnalysis.detection.artifactType,
      artifactLabel: emptyAnalysis.detection.label,
      suggestions: emptyAnalysis.suggestions,
    };
  }

  const analysis = analyzeArtifact({
    assignment: input.assignment,
    content,
    title: input.title,
    formatsOverride: input.formats,
    designTemplate,
  });

  const formats = analysis.detection.formatPlan.formats;
  const baseFileName = buildDeliverableBaseName(
    input.assignment,
    input.title,
  );
  const documentOutline = buildDocumentOutline({
    content,
    assignment: input.assignment,
    title: input.title,
    designTemplate,
  });

  const deliverables: Deliverable[] = [];
  const generateOptions = {
    assignment: input.assignment,
    title: input.title,
    designTemplate,
    authorLabel: "MINERVOT",
  };

  for (const format of formats) {
    const generator = getDeliverableGenerator(format);
    if (!generator) continue;

    const file = await generator.generate(content, baseFileName, generateOptions);
    const stored = saveDeliverableFile(file, options.userId);
    deliverables.push(toDeliverableMetadata(stored, requestOrigin));
  }

  const generatedFormats = deliverables.map((item) => item.format);
  const suggestions = analyzeArtifact({
    assignment: input.assignment,
    content,
    title: input.title,
    formatsOverride: input.formats,
    designTemplate,
    generatedFormats,
  }).suggestions;

  return {
    deliverables,
    detection: {
      formats,
      matchedRule: analysis.detection.formatPlan.matchedRule,
    },
    documentOutline,
    designTemplate,
    artifactType: analysis.detection.artifactType,
    artifactLabel: analysis.detection.label,
    suggestions,
  };
}

import {
  DEFAULT_DESIGN_TEMPLATE,
  type DesignTemplateId,
} from "@/lib/deliverables/document-model";
import {
  contentHasMarkdownTable,
  shouldGenerateXlsx,
} from "@/lib/deliverables/excel-data";
import type { DeliverableFormat } from "@/lib/deliverables/types";

import { buildArtifactSuggestions } from "./build-suggestions";
import { detectArtifactType } from "./detect-artifact-type";
import { recommendArtifactFormats } from "./recommend-formats";
import type {
  ArtifactDetection,
  ArtifactSuggestion,
} from "./types";

export type AnalyzeArtifactInput = {
  assignment: string;
  content: string;
  title?: string;
  formatsOverride?: DeliverableFormat[];
  designTemplate?: DesignTemplateId;
  hasWorkProfile?: boolean;
  generatedFormats?: readonly DeliverableFormat[];
};

export type AnalyzeArtifactResult = {
  detection: ArtifactDetection;
  suggestions: ArtifactSuggestion[];
};

/**
 * Artifact Generation Engine — analyze step.
 * Parses intent, chooses formats, and prepares post-completion suggestions.
 * No AI calls.
 */
export function analyzeArtifact(
  input: AnalyzeArtifactInput,
): AnalyzeArtifactResult {
  const detected = detectArtifactType({
    assignment: input.assignment,
    content: input.content,
    title: input.title,
  });

  const formatPlan = recommendArtifactFormats({
    artifactType: detected.artifactType,
    assignment: input.assignment,
    content: input.content,
    override: input.formatsOverride,
  });

  const excelRecommended =
    shouldGenerateXlsx(input.assignment, input.content) ||
    contentHasMarkdownTable(input.content) ||
    ["ranking", "list", "household", "schedule", "invoice"].includes(
      detected.artifactType,
    );

  const detection: ArtifactDetection = {
    artifactType: detected.artifactType,
    label: detected.label,
    documentType: detected.documentType,
    formatPlan,
    designTemplate: input.designTemplate ?? DEFAULT_DESIGN_TEMPLATE,
    excelRecommended,
  };

  const suggestions = buildArtifactSuggestions({
    artifactType: detected.artifactType,
    assignment: input.assignment,
    content: input.content,
    generatedFormats: input.generatedFormats ?? formatPlan.formats,
    hasWorkProfile: input.hasWorkProfile,
    excelRecommended,
  });

  return { detection, suggestions };
}

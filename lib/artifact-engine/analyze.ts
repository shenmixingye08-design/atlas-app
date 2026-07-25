import type { DeliverableFormat } from "@/lib/deliverables/types";

import { buildArtifactDocument } from "./build-document";
import { buildArtifactSuggestions } from "./build-suggestions";
import { detectArtifactType } from "./detect-artifact-type";
import type { ArtifactDocument } from "./document";
import type { OrgAssistProfile } from "./org-assist-store";
import type { ArtifactTemplateId } from "./templates/types";
import type {
  ArtifactDetection,
  ArtifactSuggestion,
} from "./types";

export type AnalyzeArtifactInput = {
  assignment: string;
  content: string;
  title?: string;
  formatsOverride?: DeliverableFormat[];
  designTemplate?: ArtifactTemplateId;
  hasWorkProfile?: boolean;
  generatedFormats?: readonly DeliverableFormat[];
  generatedFiles?: Array<{
    format: DeliverableFormat;
    downloadUrl?: string;
    fileName?: string;
    sizeBytes?: number;
  }>;
  failedFormats?: DeliverableFormat[];
  orgProfile?: OrgAssistProfile | null;
};

export type AnalyzeArtifactResult = {
  detection: ArtifactDetection;
  suggestions: ArtifactSuggestion[];
  document: ArtifactDocument;
};

/**
 * Artifact Generation Engine — analyze + structure step.
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

  const document = buildArtifactDocument({
    assignment: input.assignment,
    content: input.content,
    title: input.title,
    templateOverride: input.designTemplate,
    orgProfile: input.orgProfile,
    generatedFiles:
      input.generatedFiles ??
      input.generatedFormats?.map((format) => ({ format })),
    failedFormats: input.failedFormats,
  });

  if (input.formatsOverride && input.formatsOverride.length > 0) {
    document.recommendedFormats = [...input.formatsOverride];
    document.otherFormats = [];
    document.formatStates = document.formatStates.map((state) => ({
      ...state,
      recommended: input.formatsOverride!.includes(state.format),
    }));
  }

  const detection: ArtifactDetection = {
    artifactType: document.artifactType,
    label: document.artifactLabel,
    documentType: detected.documentType,
    formatPlan: {
      formats: [...document.recommendedFormats, ...document.otherFormats],
      recommended: document.recommendedFormats,
      other: document.otherFormats,
      matchedRule: `template:${document.templateId}`,
    },
    designTemplate: document.designId,
    templateLabel: document.templateLabel,
    excelRecommended: !document.excelNotApplicable,
    excelNotApplicable: document.excelNotApplicable,
    excelNotApplicableReason: document.excelNotApplicableReason,
  };

  const suggestions = buildArtifactSuggestions({
    artifactType: document.artifactType,
    assignment: input.assignment,
    content: input.content,
    generatedFormats:
      input.generatedFormats ??
      document.formatStates
        .filter((state) => state.status === "ready")
        .map((state) => state.format),
    hasWorkProfile: input.hasWorkProfile,
    excelRecommended: !document.excelNotApplicable,
    excelNotApplicable: document.excelNotApplicable,
    document,
  });

  return { detection, suggestions, document };
}

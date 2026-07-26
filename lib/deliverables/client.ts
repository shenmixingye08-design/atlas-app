import type { ArtifactDocument } from "@/lib/artifact-engine/document";
import type { ArtifactSuggestion } from "@/lib/artifact-engine/types";
import type { ArtifactTemplateId } from "@/lib/artifact-engine/templates/types";
import type { Deliverable, DeliverableFormat } from "@/lib/deliverables/types";
import type { IntegrationUploadSummary } from "@/lib/integrations/types";

export type GenerateDeliverablesRequest = {
  assignment: string;
  finalDeliverable: string;
  title?: string;
  workflowId?: string;
  projectName?: string;
  formats?: DeliverableFormat[];
  designTemplate?: ArtifactTemplateId;
};

export type DocumentOutlineResponse = {
  documentType: string;
  documentTypeLabel: string;
  designTemplate: ArtifactTemplateId;
  title: string;
  subtitle?: string;
  sectionTitles: string[];
};

export type GenerateDeliverablesResponse = {
  deliverables: Deliverable[];
  matchedRule: string | null;
  uploads?: IntegrationUploadSummary;
  designTemplate?: ArtifactTemplateId;
  documentOutline?: DocumentOutlineResponse;
  artifactType?: string;
  artifactLabel?: string;
  templateLabel?: string;
  suggestions?: ArtifactSuggestion[];
  artifactDocument?: ArtifactDocument;
  completionStatus?: ArtifactDocument["completionStatus"];
  formatStates?: ArtifactDocument["formatStates"];
};

export async function requestDeliverables(
  input: GenerateDeliverablesRequest,
  signal?: AbortSignal,
): Promise<GenerateDeliverablesResponse> {
  const response = await fetch("/api/deliverables/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });

  const data = (await response.json()) as GenerateDeliverablesResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? `Deliverables request failed (${response.status})`);
  }

  return data;
}

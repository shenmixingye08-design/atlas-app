import type { Deliverable, DeliverableFormat } from "@/lib/deliverables/types";
import type { IntegrationUploadSummary } from "@/lib/integrations/types";

export type GenerateDeliverablesRequest = {
  assignment: string;
  finalDeliverable: string;
  title?: string;
  workflowId?: string;
  projectName?: string;
  /** Generate only these formats; omit to auto-detect from assignment. */
  formats?: DeliverableFormat[];
};

export type GenerateDeliverablesResponse = {
  deliverables: Deliverable[];
  matchedRule: string | null;
  uploads?: IntegrationUploadSummary;
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

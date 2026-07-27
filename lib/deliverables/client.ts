import type { Deliverable, DeliverableFormat } from "@/lib/deliverables/types";
import type { IntegrationUploadSummary } from "@/lib/integrations/types";

import { classifyDeliverableFailureReason } from "./failure-messages";

export type GenerateDeliverablesRequest = {
  assignment: string;
  finalDeliverable: string;
  title?: string;
  workflowId?: string;
  jobId?: string;
  projectName?: string;
  generationAttempt?: number;
  /** Generate only these formats; omit to auto-detect from assignment. */
  formats?: DeliverableFormat[];
};

export type GenerateDeliverablesResponse = {
  deliverables: Deliverable[];
  matchedRule: string | null;
  failures?: Array<{ format: string; reasons: string[] }>;
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

  // Surface Word/PDF generation or store failures instead of silently returning [].
  if (
    (!data.deliverables || data.deliverables.length === 0) &&
    data.failures &&
    data.failures.length > 0
  ) {
    const wordFailure = data.failures.find((item) => item.format === "docx");
    const primary = wordFailure ?? data.failures[0]!;
    const classified = classifyDeliverableFailureReason(
      primary.reasons[0] ?? "",
    );
    throw new Error(
      classified.userMessage ||
        primary.reasons.join(" / ") ||
        "ファイル生成に失敗しました",
    );
  }

  return data;
}

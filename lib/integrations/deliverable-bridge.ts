import "server-only";

import type { Deliverable } from "@/lib/deliverables/types";

import { integrationService } from "./integration-service";
import type {
  DeliverableDispatchRequest,
  DeliverableDispatchResult,
  IntegrationUploadSummary,
} from "./types";

export type { IntegrationUploadSummary };

/**
 * Bridge between the Deliverables engine and external integrations.
 * Upload failures are captured and never thrown to callers.
 */
export async function dispatchDeliverablesToIntegrations(
  deliverables: readonly Deliverable[],
  requests: readonly DeliverableDispatchRequest[],
): Promise<DeliverableDispatchResult[]> {
  if (deliverables.length === 0 || requests.length === 0) {
    return [];
  }

  const results: DeliverableDispatchResult[] = [];

  for (const request of requests) {
    const deliverable = deliverables.find((item) => item.id === request.deliverableId);
    if (!deliverable) {
      results.push({
        success: false,
        integrationId: request.integrationId,
        action: request.action,
        message: `Deliverable not found: ${request.deliverableId}`,
      });
      continue;
    }

    results.push(
      await integrationService.dispatchDeliverable(request, deliverable),
    );
  }

  return results;
}

export async function uploadDeliverablesAfterGeneration(input: {
  deliverables: readonly Deliverable[];
  projectName: string;
  workflowId?: string | null;
}): Promise<IntegrationUploadSummary> {
  try {
    return await integrationService.uploadDeliverables(input);
  } catch (error) {
    console.error("[uploadDeliverablesAfterGeneration]", error);

    return {
      workflowId: input.workflowId ?? null,
      projectName: input.projectName,
      provider: null,
      storageLocation: null,
      folderUrl: null,
      uploads: input.deliverables.map((deliverable) => ({
        deliverableId: deliverable.id,
        fileName: deliverable.fileName,
        provider: "google_drive",
        integrationId: "",
        workflowId: input.workflowId ?? null,
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Upload pipeline failed unexpectedly",
      })),
      status: "failed",
    };
  }
}

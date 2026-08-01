import { knowledgeService } from "@/lib/knowledge/knowledge-service";
import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import type { KnowledgeRetrievalResult } from "@/lib/knowledge/types";

/** Retrieve executive memory before the CEO phase (tenant-scoped). */
export async function retrieveExecutiveMemory(
  assignment: string,
  workflowId: string,
  deliverableType: DeliverableType,
  userId?: string | null
): Promise<KnowledgeRetrievalResult> {
  if (!userId) {
    // No user → empty retrieval (never fall back to a global pool).
    const { buildKnowledgeRetrievalResult } = await import(
      "@/lib/knowledge/retrieval"
    );
    return buildKnowledgeRetrievalResult(
      assignment,
      workflowId,
      [],
      deliverableType
    );
  }
  return knowledgeService.retrieveForWorkflow(
    assignment,
    workflowId,
    deliverableType,
    userId
  );
}

import { knowledgeService } from "@/lib/knowledge/knowledge-service";
import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import type { KnowledgeRetrievalResult } from "@/lib/knowledge/types";

/** Retrieve executive memory before the CEO phase. */
export async function retrieveExecutiveMemory(
  assignment: string,
  workflowId: string,
  deliverableType: DeliverableType,
): Promise<KnowledgeRetrievalResult> {
  return knowledgeService.retrieveForWorkflow(assignment, workflowId, deliverableType);
}

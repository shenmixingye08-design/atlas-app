import { knowledgeService } from "@/lib/knowledge/knowledge-service";
import type { OrchestrationResult } from "@/lib/orchestration/types";

/** Persist workflow learnings into the Company Knowledge Base. */
export async function ingestWorkflowKnowledge(
  workflowId: string,
  result: OrchestrationResult,
  metadata?: Readonly<Record<string, unknown>>,
): Promise<void> {
  const userFeedback =
    typeof metadata?.userFeedback === "string" ? metadata.userFeedback : null;

  const userId =
    typeof metadata?.userId === "string" && metadata.userId.trim()
      ? metadata.userId.trim()
      : undefined;

  await knowledgeService.ingestFromWorkflow(result, {
    workflowId,
    assignment: result.assignment,
    userFeedback,
    userId,
  });
}

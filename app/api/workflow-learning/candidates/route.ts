import {
  jsonFromWorkflowLearningError,
  requireWorkflowLearningUser,
} from "@/lib/workflow-learning/http";
import { listWorkflowCandidates } from "@/lib/workflow-learning/service";
import type { WorkflowLearningCandidate } from "@/lib/workflow-learning/types";

export async function GET(request: Request): Promise<Response> {
  try {
    const { userId, email } = await requireWorkflowLearningUser();
    const url = new URL(request.url);
    const automationId = url.searchParams.get("automationId") ?? undefined;
    const status = (url.searchParams.get("status") ?? "all") as
      | WorkflowLearningCandidate["status"]
      | "all";
    const candidates = await listWorkflowCandidates({
      userId,
      email,
      automationId,
      status,
    });
    return Response.json({ candidates });
  } catch (error) {
    return jsonFromWorkflowLearningError(error);
  }
}

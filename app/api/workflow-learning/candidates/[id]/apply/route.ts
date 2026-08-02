import {
  jsonFromWorkflowLearningError,
  requireWorkflowLearningUser,
} from "@/lib/workflow-learning/http";
import { applyCandidate } from "@/lib/workflow-learning/service";
import type { WorkflowLearningPatch } from "@/lib/workflow-learning/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId, email } = await requireWorkflowLearningUser();
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      trial?: boolean;
      allowHighRiskExternal?: boolean;
      editedPatch?: WorkflowLearningPatch;
    };
    const result = await applyCandidate({
      userId,
      email,
      candidateId: id,
      trial: Boolean(body.trial),
      allowHighRiskExternal: Boolean(body.allowHighRiskExternal),
      editedPatch: body.editedPatch,
    });
    return Response.json(result);
  } catch (error) {
    return jsonFromWorkflowLearningError(error);
  }
}

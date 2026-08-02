import {
  jsonFromWorkflowLearningError,
  requireWorkflowLearningUser,
} from "@/lib/workflow-learning/http";
import { approveCandidate } from "@/lib/workflow-learning/service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId, email } = await requireWorkflowLearningUser();
    const { id } = await context.params;
    const candidate = await approveCandidate({
      userId,
      email,
      candidateId: id,
    });
    return Response.json({ candidate });
  } catch (error) {
    return jsonFromWorkflowLearningError(error);
  }
}

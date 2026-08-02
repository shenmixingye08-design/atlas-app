import {
  jsonFromWorkflowLearningError,
  requireWorkflowLearningUser,
} from "@/lib/workflow-learning/http";
import { rejectCandidate } from "@/lib/workflow-learning/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { userId, email } = await requireWorkflowLearningUser();
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      suppressFuture?: boolean;
    };
    const candidate = await rejectCandidate({
      userId,
      email,
      candidateId: id,
      suppressFuture: Boolean(body.suppressFuture),
    });
    return Response.json({ candidate });
  } catch (error) {
    return jsonFromWorkflowLearningError(error);
  }
}

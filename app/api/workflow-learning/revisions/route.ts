import {
  jsonFromWorkflowLearningError,
  requireWorkflowLearningUser,
} from "@/lib/workflow-learning/http";
import { listRevisionsForUser } from "@/lib/workflow-learning/service";

export async function GET(request: Request): Promise<Response> {
  try {
    const { userId, email } = await requireWorkflowLearningUser();
    const automationId = new URL(request.url).searchParams.get("automationId");
    if (!automationId) {
      return Response.json(
        { error: { code: "invalid", message: "automationIdが必要です" } },
        { status: 400 },
      );
    }
    const revisions = await listRevisionsForUser({
      userId,
      email,
      automationId,
    });
    return Response.json({ revisions });
  } catch (error) {
    return jsonFromWorkflowLearningError(error);
  }
}

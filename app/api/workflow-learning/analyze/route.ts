import {
  jsonFromWorkflowLearningError,
  requireWorkflowLearningUser,
} from "@/lib/workflow-learning/http";
import { analyzeWorkflowLearningForAutomation } from "@/lib/workflow-learning/service";

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId, email } = await requireWorkflowLearningUser();
    const body = (await request.json()) as { automationId?: string };
    if (!body.automationId) {
      return Response.json(
        { error: { code: "invalid", message: "automationIdが必要です" } },
        { status: 400 },
      );
    }
    const candidates = await analyzeWorkflowLearningForAutomation({
      userId,
      email,
      automationId: body.automationId,
    });
    return Response.json({ candidates });
  } catch (error) {
    return jsonFromWorkflowLearningError(error);
  }
}

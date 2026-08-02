import {
  jsonFromWorkflowLearningError,
  requireWorkflowLearningUser,
} from "@/lib/workflow-learning/http";
import { compareAutomationLearning } from "@/lib/workflow-learning/service";

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId, email } = await requireWorkflowLearningUser();
    const body = (await request.json()) as {
      automationId?: string;
      beforeRevisionId?: string;
      afterRevisionId?: string;
    };
    if (!body.automationId || !body.beforeRevisionId || !body.afterRevisionId) {
      return Response.json(
        { error: { code: "invalid", message: "比較対象が不足しています" } },
        { status: 400 },
      );
    }
    const comparison = await compareAutomationLearning({
      userId,
      email,
      automationId: body.automationId,
      beforeRevisionId: body.beforeRevisionId,
      afterRevisionId: body.afterRevisionId,
    });
    return Response.json({ comparison });
  } catch (error) {
    return jsonFromWorkflowLearningError(error);
  }
}

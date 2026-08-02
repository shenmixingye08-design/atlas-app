import {
  jsonFromWorkflowLearningError,
  requireWorkflowLearningUser,
} from "@/lib/workflow-learning/http";
import { rollbackAutomationRevision } from "@/lib/workflow-learning/service";

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId, email } = await requireWorkflowLearningUser();
    const body = (await request.json()) as {
      automationId?: string;
      targetRevisionId?: string;
    };
    if (!body.automationId || !body.targetRevisionId) {
      return Response.json(
        {
          error: {
            code: "invalid",
            message: "automationIdとtargetRevisionIdが必要です",
          },
        },
        { status: 400 },
      );
    }
    const result = await rollbackAutomationRevision({
      userId,
      email,
      automationId: body.automationId,
      targetRevisionId: body.targetRevisionId,
    });
    return Response.json(result);
  } catch (error) {
    return jsonFromWorkflowLearningError(error);
  }
}

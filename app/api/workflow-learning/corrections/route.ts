import {
  jsonFromWorkflowLearningError,
  requireWorkflowLearningUser,
} from "@/lib/workflow-learning/http";
import { recordWorkflowCorrection } from "@/lib/workflow-learning/service";

export async function POST(request: Request): Promise<Response> {
  try {
    const { userId, email } = await requireWorkflowLearningUser();
    const body = (await request.json()) as {
      automationId?: string;
      text?: string;
      runId?: string | null;
      source?: string | null;
    };
    if (!body.automationId || !body.text) {
      return Response.json(
        { error: { code: "invalid", message: "automationIdとtextが必要です" } },
        { status: 400 },
      );
    }
    const result = await recordWorkflowCorrection({
      userId,
      email,
      automationId: body.automationId,
      text: body.text,
      runId: body.runId,
      source: body.source,
    });
    return Response.json(result);
  } catch (error) {
    return jsonFromWorkflowLearningError(error);
  }
}

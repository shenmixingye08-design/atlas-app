import {
  jsonFromWorkflowLearningError,
  requireWorkflowLearningUser,
} from "@/lib/workflow-learning/http";
import {
  getWorkflowLearningSettingsForUser,
  updateWorkflowLearningSettingsForUser,
} from "@/lib/workflow-learning/service";
import type { WorkflowLearningSettings } from "@/lib/workflow-learning/types";

export async function GET(): Promise<Response> {
  try {
    const { userId, email } = await requireWorkflowLearningUser();
    const settings = await getWorkflowLearningSettingsForUser(userId, email);
    return Response.json({ settings });
  } catch (error) {
    return jsonFromWorkflowLearningError(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const { userId, email } = await requireWorkflowLearningUser();
    const body = (await request.json()) as Partial<WorkflowLearningSettings>;
    const settings = await updateWorkflowLearningSettingsForUser(
      userId,
      email,
      body,
    );
    return Response.json({ settings });
  } catch (error) {
    return jsonFromWorkflowLearningError(error);
  }
}

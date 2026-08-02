import { auth, currentUser } from "@clerk/nextjs/server";

import { WorkflowLearningError } from "@/lib/workflow-learning/security";

export async function requireWorkflowLearningUser(): Promise<{
  userId: string;
  email: string | null;
}> {
  const { userId } = await auth();
  if (!userId) {
    throw new WorkflowLearningError("ログインが必要です", "unauthorized", 401);
  }
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;
  return { userId, email };
}

export function jsonFromWorkflowLearningError(error: unknown): Response {
  if (error instanceof WorkflowLearningError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.httpStatus },
    );
  }
  return Response.json(
    {
      error: {
        code: "internal",
        message: error instanceof Error ? error.message : "error",
      },
    },
    { status: 500 },
  );
}

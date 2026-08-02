import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { jsonError } from "@/lib/automation-platform/http/respond";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { auth } from "@clerk/nextjs/server";

type RouteContext = {
  params: Promise<{ runId: string; stepId: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { runId, stepId } = await context.params;
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.run.step.retry",
      runId,
    });
  }

  try {
    let mode: "failed_only" | "from_failed" = "failed_only";
    try {
      const body = (await request.json()) as { mode?: string };
      if (body.mode === "from_failed") mode = "from_failed";
    } catch {
      // default failed_only
    }

    const access = await resolveFeatureAccessContext();
    const run = await automationPlatformService.retryRunSafe(
      userId,
      runId,
      access,
      { mode, stepId },
    );
    return Response.json({ run });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.run.step.retry",
      runId,
    });
  }
}
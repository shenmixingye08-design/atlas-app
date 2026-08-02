import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { jsonError } from "@/lib/automation-platform/http/respond";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { auth } from "@clerk/nextjs/server";

type RouteContext = { params: Promise<{ runId: string }> };

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { runId } = await context.params;
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.run.retry",
      runId,
    });
  }

  try {
    const access = await resolveFeatureAccessContext();
    const run = await automationPlatformService.retryRun(userId, runId, access);
    return Response.json({ run });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.run.retry",
      runId,
    });
  }
}

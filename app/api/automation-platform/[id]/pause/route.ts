import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { jsonError } from "@/lib/automation-platform/http/respond";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { auth } from "@clerk/nextjs/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { id } = await context.params;
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.pause",
      automationId: id,
    });
  }

  try {
    let cancelRunningRuns = false;
    let cancelPendingApprovals = false;
    try {
      const body = (await request.json()) as {
        cancelRunningRuns?: unknown;
        cancelPendingApprovals?: unknown;
      };
      cancelRunningRuns = body.cancelRunningRuns === true;
      cancelPendingApprovals = body.cancelPendingApprovals === true;
    } catch {
      // empty body: keep running / keep approvals
    }

    const access = await resolveFeatureAccessContext();
    const result = await automationPlatformService.pause(userId, id, access, {
      cancelRunningRuns,
      cancelPendingApprovals,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.pause",
      automationId: id,
    });
  }
}

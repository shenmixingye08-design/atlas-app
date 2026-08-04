import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { jsonError } from "@/lib/automation-platform/http/respond";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { auth } from "@clerk/nextjs/server";

type RouteContext = { params: Promise<{ runId: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { runId } = await context.params;
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.run.cancel",
      runId,
    });
  }

  try {
    let reason: string | null = null;
    try {
      const body = (await request.json()) as { reason?: unknown };
      if (typeof body.reason === "string") reason = body.reason;
    } catch {
      // empty body is fine
    }

    const access = await resolveFeatureAccessContext();
    const run = await automationPlatformService.cancelRun(
      userId,
      runId,
      access,
      { reason },
    );
    return Response.json({ run });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.run.cancel",
      runId,
    });
  }
}

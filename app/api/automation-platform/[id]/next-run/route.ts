import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { jsonError } from "@/lib/automation-platform/http/respond";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { auth } from "@clerk/nextjs/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { id } = await context.params;
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.next_run",
      automationId: id,
    });
  }

  try {
    const access = await resolveFeatureAccessContext();
    const nextRunAt = await automationPlatformService.getNextRunAt(userId, id, access);
    return Response.json({ nextRunAt });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.next_run",
      automationId: id,
    });
  }
}

import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { jsonError } from "@/lib/automation-platform/http/respond";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { auth } from "@clerk/nextjs/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { id } = await context.params;
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.duplicate",
      automationId: id,
    });
  }

  try {
    const access = await resolveFeatureAccessContext();
    const automation = automationPlatformService.duplicate(userId, id, access);
    return Response.json({ automation }, { status: 201 });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.duplicate",
      automationId: id,
    });
  }
}

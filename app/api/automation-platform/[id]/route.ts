import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { jsonError } from "@/lib/automation-platform/http/respond";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import type { UpdateAutomationV2Input } from "@/lib/automation-platform/types";
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
      action: "automation.get",
      automationId: id,
    });
  }

  try {
    const access = await resolveFeatureAccessContext();
    const automation = await automationPlatformService.get(userId, id, access);
    return Response.json({ automation });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.get",
      automationId: id,
    });
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { id } = await context.params;
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.update",
      automationId: id,
    });
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AutomationPlatformError("automation_invalid_definition", {
        reason: "invalid_json",
      });
    }

    const access = await resolveFeatureAccessContext();
    const updated = await automationPlatformService.update(
      userId,
      id,
      body as UpdateAutomationV2Input,
      access,
    );
    return Response.json({ automation: updated });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.update",
      automationId: id,
    });
  }
}

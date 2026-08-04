import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { jsonError } from "@/lib/automation-platform/http/respond";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { auth } from "@clerk/nextjs/server";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.list",
    });
  }

  try {
    const context = await resolveFeatureAccessContext();
    const items = await automationPlatformService.list(userId, context);
    return Response.json({ automations: items });
  } catch (error) {
    return jsonError(error, { actorUserId: userId, action: "automation.list" });
  }
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.create",
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

    const context = await resolveFeatureAccessContext();
    const created = await automationPlatformService.createFromUnknownBody(
      userId,
      body,
      context,
    );
    return Response.json({ automation: created }, { status: 201 });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.create",
    });
  }
}

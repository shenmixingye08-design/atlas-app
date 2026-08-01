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
      action: "automation.runs.list",
      automationId: id,
    });
  }

  try {
    const access = await resolveFeatureAccessContext();
    const runs = automationPlatformService.listRuns(userId, id, access);
    return Response.json({ runs });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.runs.list",
      automationId: id,
    });
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  const { id } = await context.params;
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.run",
      automationId: id,
    });
  }

  try {
    let clientKey: string | null = null;
    try {
      const body = (await request.json()) as { idempotencyKey?: unknown };
      if (typeof body.idempotencyKey === "string") {
        clientKey = body.idempotencyKey;
      }
    } catch {
      // empty body is fine for manual run
    }

    const access = await resolveFeatureAccessContext();
    const result = automationPlatformService.enqueueRun({
      userId,
      automationId: id,
      triggerType: "manual",
      clientIdempotencyKey: clientKey,
      context: access,
    });

    return Response.json(
      { run: result.run, created: result.created },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.run",
      automationId: id,
    });
  }
}

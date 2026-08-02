import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { jsonError } from "@/lib/automation-platform/http/respond";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { auth } from "@clerk/nextjs/server";

type RouteContext = { params: Promise<{ id: string }> };

function resolveOrigin(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${protocol}://${host}`;
  return new URL(request.url).origin;
}

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
    const runs = await automationPlatformService.listRuns(userId, id, access);
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
    const result = await automationPlatformService.enqueueRun({
      userId,
      automationId: id,
      triggerType: "manual",
      clientIdempotencyKey: clientKey,
      context: access,
      requestOrigin: resolveOrigin(request),
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

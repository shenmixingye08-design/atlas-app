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
      action: "automation.run.resume",
      runId,
    });
  }

  try {
    let inputPatch: Record<string, unknown> | undefined;
    try {
      const body = (await request.json()) as { input?: Record<string, unknown> };
      if (body.input && typeof body.input === "object") {
        inputPatch = body.input;
      }
    } catch {
      // empty body is fine
    }

    const access = await resolveFeatureAccessContext();
    const run = await automationPlatformService.resumeRunAfterInput(
      userId,
      runId,
      access,
      inputPatch,
      { dispatch: true },
    );
    return Response.json({ run });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.run.resume",
      runId,
    });
  }
}

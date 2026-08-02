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
      action: "automation.operations.summary",
    });
  }

  try {
    const access = await resolveFeatureAccessContext();
    const summary = await automationPlatformService.getOperationsSummary(
      userId,
      access,
    );
    return Response.json({ summary });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.operations.summary",
    });
  }
}

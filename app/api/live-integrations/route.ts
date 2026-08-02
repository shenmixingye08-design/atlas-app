import { auth } from "@clerk/nextjs/server";

import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  buildLiveIntegrationsDashboard,
  countAutomationsByLiveService,
  preflightLiveIntegrations,
} from "@/lib/live-integrations";
import type { AutomationCapabilityId } from "@/lib/automation-platform/types";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const context = await resolveFeatureAccessContext();
  let automationCounts: ReturnType<typeof countAutomationsByLiveService> = {};
  try {
    const automations = await automationPlatformService.list(userId, context);
    automationCounts = countAutomationsByLiveService(
      automations.map((a) => ({ workflow: a.workflow })),
    );
  } catch {
    automationCounts = {};
  }

  const url = new URL(request.url);
  const capabilities = url.searchParams.get("capabilities");
  if (capabilities) {
    const capabilityIds = capabilities
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean) as AutomationCapabilityId[];
    const preflight = await preflightLiveIntegrations({
      userId,
      capabilityIds,
    });
    return Response.json({ preflight });
  }

  const dashboard = await buildLiveIntegrationsDashboard(
    userId,
    automationCounts,
  );
  return Response.json({ dashboard });
}

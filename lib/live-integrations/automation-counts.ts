import "server-only";

import type { AutomationCapabilityId } from "@/lib/automation-platform/types";
import type { LiveIntegrationServiceId } from "@/lib/live-integrations/types";

const CAPABILITY_TO_SERVICE: Partial<
  Record<AutomationCapabilityId, LiveIntegrationServiceId>
> = {
  gmail: "gmail",
  google_calendar: "google_calendar",
  dropbox: "dropbox",
  wordpress: "wordpress",
  x_post: "x",
};

type AutomationLike = {
  workflow?: {
    steps?: Array<{ type?: string; enabled?: boolean }>;
  };
  steps?: Array<{ type?: string; enabled?: boolean }>;
};

/**
 * Count active automations referencing each live service.
 * Accepts either V2 workflow.steps or flattened steps.
 */
export function countAutomationsByLiveService(
  automations: readonly AutomationLike[],
): Partial<Record<LiveIntegrationServiceId, number>> {
  const counts: Partial<Record<LiveIntegrationServiceId, number>> = {};

  for (const automation of automations) {
    const steps =
      automation.workflow?.steps ?? automation.steps ?? [];
    const seen = new Set<LiveIntegrationServiceId>();
    for (const step of steps) {
      if (step.enabled === false) continue;
      const type = step.type as AutomationCapabilityId | undefined;
      if (!type) continue;
      const service = CAPABILITY_TO_SERVICE[type];
      if (!service || seen.has(service)) continue;
      seen.add(service);
      counts[service] = (counts[service] ?? 0) + 1;
    }
  }

  return counts;
}

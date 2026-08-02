import "server-only";

import type { AutomationCapabilityId } from "@/lib/automation-platform/types";
import { getLiveIntegrationStatus } from "@/lib/live-integrations/status";
import type {
  LiveIntegrationServiceId,
  PreflightIssue,
  PreflightResult,
} from "@/lib/live-integrations/types";

const CAPABILITY_TO_SERVICE: Partial<
  Record<AutomationCapabilityId, LiveIntegrationServiceId>
> = {
  gmail: "gmail",
  google_calendar: "google_calendar",
  dropbox: "dropbox",
  wordpress: "wordpress",
  x_post: "x",
};

/**
 * Preflight before Automation run / create.
 * Blocks when required live integrations are not ready.
 */
export async function preflightLiveIntegrations(input: {
  userId: string;
  capabilityIds: readonly AutomationCapabilityId[];
}): Promise<PreflightResult> {
  const needed = new Set<LiveIntegrationServiceId>();
  for (const cap of input.capabilityIds) {
    const service = CAPABILITY_TO_SERVICE[cap];
    if (service) needed.add(service);
  }

  const issues: PreflightIssue[] = [];
  for (const serviceId of needed) {
    const status = await getLiveIntegrationStatus(input.userId, serviceId);
    if (status.status === "connected") continue;

    const code =
      status.status === "not_connected"
        ? "not_connected"
        : status.status === "insufficient_scope"
          ? "insufficient_scope"
          : status.status === "expired"
            ? "expired"
            : status.status === "feature_disabled"
              ? "feature_disabled"
              : "needs_reconnect";

    issues.push({
      serviceId,
      code,
      severity: "block",
      title:
        code === "not_connected"
          ? `${status.label}未接続です`
          : code === "insufficient_scope"
            ? `${status.label}の権限が不足しています`
            : `${status.label}の再接続が必要です`,
      description: status.message,
      actionLabel:
        code === "not_connected"
          ? "接続する"
          : code === "insufficient_scope"
            ? "権限を修正する"
            : "再接続する",
      actionHref: status.reconnectHref ?? status.connectHref,
    });
  }

  return {
    ok: issues.filter((i) => i.severity === "block").length === 0,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

export function capabilityIdsNeedingLiveIntegrations(
  capabilityIds: readonly AutomationCapabilityId[],
): LiveIntegrationServiceId[] {
  const out: LiveIntegrationServiceId[] = [];
  for (const cap of capabilityIds) {
    const service = CAPABILITY_TO_SERVICE[cap];
    if (service && !out.includes(service)) out.push(service);
  }
  return out;
}

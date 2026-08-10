import type { Automation } from "@/lib/automations/types";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import { resolveEntrustedJobStatus } from "@/lib/automations/display";

import type {
  CanonicalAutomation,
  CanonicalLifecycleStatus,
} from "./types";

function v1Lifecycle(automation: Automation): CanonicalLifecycleStatus {
  const status = resolveEntrustedJobStatus(automation);
  switch (status) {
    case "paused":
      return "paused";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "error":
      return "failed";
    case "needs_review":
      return "needs_review";
    case "scheduled":
    default:
      return automation.enabled ? "active" : "paused";
  }
}

function v2Lifecycle(automation: AutomationV2): CanonicalLifecycleStatus {
  switch (automation.status) {
    case "active":
      return "active";
    case "paused":
    case "disabled":
      return "paused";
    case "draft":
      return "draft";
    case "archived":
      return "archived";
    default:
      return "paused";
  }
}

export function extractV1ShadowId(automation: AutomationV2): string | null {
  if (automation.legacyAutomationId) return automation.legacyAutomationId;
  const sid = automation.instruction?.structuredOptions?.v1SchedulerId;
  return typeof sid === "string" && sid.trim() ? sid.trim() : null;
}

export function toCanonicalFromV1(automation: Automation): CanonicalAutomation {
  const lifecycleStatus = v1Lifecycle(automation);
  return {
    canonicalId: `v1:${automation.id}`,
    generation: "v1",
    id: automation.id,
    title: automation.name,
    description: automation.description || automation.schedule.label,
    enabled: automation.enabled,
    lifecycleStatus,
    nextRunAt: automation.nextRun,
    lastRunAt: automation.lastRun,
    scheduleSummary: automation.schedule.label,
    canEdit: true,
    canPause: automation.enabled,
    canResume: !automation.enabled,
    canDelete: true,
    canRunNow: automation.enabled,
    deleteSemantics: "soft_delete",
    href: `/automations?id=${encodeURIComponent(automation.id)}`,
    memoryCompatible: true,
    linkedV1Id: automation.id,
    linkedV2Id: null,
  };
}

export function toCanonicalFromV2(automation: AutomationV2): CanonicalAutomation {
  const linkedV1Id = extractV1ShadowId(automation);
  const lifecycleStatus = v2Lifecycle(automation);
  const isActive = automation.status === "active";
  const isPaused =
    automation.status === "paused" || automation.status === "draft";
  return {
    canonicalId: `v2:${automation.id}`,
    generation: "v2",
    id: automation.id,
    title: automation.name,
    description: automation.description || "",
    enabled: isActive,
    lifecycleStatus,
    nextRunAt: automation.nextRunAt,
    lastRunAt: automation.lastRunAt,
    scheduleSummary:
      automation.trigger.type === "schedule"
        ? "繰り返し実行"
        : automation.trigger.type,
    canEdit: automation.status !== "archived",
    canPause: isActive,
    canResume: isPaused,
    canDelete: automation.status !== "archived",
    canRunNow: isActive,
    deleteSemantics: "archive",
    href: `/automations?id=${encodeURIComponent(automation.id)}`,
    memoryCompatible: true,
    linkedV1Id,
    linkedV2Id: automation.id,
  };
}

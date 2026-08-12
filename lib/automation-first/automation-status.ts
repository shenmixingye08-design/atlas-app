import type { Automation } from "@/lib/automations/types";
import type { RunVisualStatus } from "@/lib/automation-first/status";
import { formatDateTimeInUserTimeZone } from "@/lib/datetime/display-timezone";

export function automationToVisualStatus(automation: Automation): RunVisualStatus {
  if (!automation.enabled) return "paused";
  switch (automation.status) {
    case "running":
      return "running";
    case "failed":
      return "failed";
    case "success":
      return "completed";
    default:
      return "scheduled";
  }
}

export function formatRunInstant(iso: string | null): string {
  return formatDateTimeInUserTimeZone(iso, { fallback: "—" });
}

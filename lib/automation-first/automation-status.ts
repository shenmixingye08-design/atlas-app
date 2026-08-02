import type { Automation } from "@/lib/automations/types";
import type { RunVisualStatus } from "@/lib/automation-first/status";

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
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

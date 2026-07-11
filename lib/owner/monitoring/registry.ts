import type { MonitorTargetId } from "./types";

export const MONITOR_TARGET_DEFINITIONS: readonly {
  id: MonitorTargetId;
  label: string;
}[] = [
  { id: "openai", label: "OpenAI" },
  { id: "stripe", label: "Stripe" },
  { id: "clerk", label: "Clerk" },
  { id: "supabase", label: "Supabase" },
  { id: "google", label: "Google" },
  { id: "dropbox", label: "Dropbox" },
  { id: "line", label: "LINE" },
  { id: "cron", label: "Cron" },
  { id: "commander", label: "Commander" },
  { id: "automation", label: "Automation" },
  { id: "notifications", label: "Notifications" },
  { id: "billing", label: "Billing" },
] as const;

export const MONITOR_TARGET_IDS = MONITOR_TARGET_DEFINITIONS.map((d) => d.id);

export function getMonitorTargetLabel(id: MonitorTargetId): string {
  return (
    MONITOR_TARGET_DEFINITIONS.find((d) => d.id === id)?.label ?? id
  );
}

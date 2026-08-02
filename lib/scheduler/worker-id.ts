import { hostname } from "node:os";

/** Stable-ish worker identity for scheduler evidence rows. */
export function getSchedulerWorkerId(): string {
  const host = hostname() || "unknown-host";
  const pid = typeof process !== "undefined" ? process.pid : 0;
  return `scheduler:${host}:${pid}`;
}

export function buildScheduleId(input: {
  automationId: string;
  scheduledAt: string;
  occurrenceKey?: string | null;
}): string {
  if (input.occurrenceKey?.trim()) return input.occurrenceKey.trim();
  return `occurrence:${input.automationId}:${input.scheduledAt}`;
}

/**
 * Dedicated X auto-post lifecycle (A–G).
 * Pure state — no I/O.
 */

import type {
  XAutoPostRun,
  XAutoPostSettings,
} from "./autopost-types";

export type XAutoPostLifecycle =
  | "disconnected" // A
  | "connecting" // B
  | "connected_unset" // C
  | "configured" // D
  | "waiting" // E
  | "succeeded" // F
  | "failed"; // G

export type XConnectionLifecycle = "disconnected" | "pending" | "connected" | "error";

export function hasConfiguredAutoPost(settings: XAutoPostSettings | null): boolean {
  if (!settings) return false;
  if (settings.enabled) return true;
  if (settings.themes.length > 0) return true;
  return settings.createdAt !== settings.updatedAt;
}

export function resolveXAutoPostLifecycle(input: {
  connectionStatus: XConnectionLifecycle;
  connecting?: boolean;
  settings: XAutoPostSettings | null;
  nextScheduledFor: string | null;
  lastRun: XAutoPostRun | null;
}): XAutoPostLifecycle {
  if (input.connecting || input.connectionStatus === "pending") {
    return "connecting";
  }
  if (input.connectionStatus !== "connected") {
    return "disconnected";
  }

  const last = input.lastRun;
  if (last?.status === "failed") return "failed";
  if (last?.status === "posted" || last?.status === "drafted") {
    return "succeeded";
  }

  if (!hasConfiguredAutoPost(input.settings)) {
    return "connected_unset";
  }

  if (input.settings?.enabled && input.nextScheduledFor) {
    return "waiting";
  }

  return "configured";
}

export function countPostedAutoPostsThisMonth(
  runs: readonly XAutoPostRun[],
  now: Date = new Date(),
): number {
  return runs.filter((run) => {
    if (run.status !== "posted") return false;
    const at = new Date(run.createdAt);
    if (Number.isNaN(at.getTime())) return false;
    return (
      at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth()
    );
  }).length;
}

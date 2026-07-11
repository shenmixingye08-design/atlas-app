import type { RecordIncidentInput } from "@/lib/owner/monitoring/types";

import { activateFallback, maybeEnableMaintenanceFromHealth } from "./fallback";
import { enqueueDisasterJob, markJobFallback, processDisasterQueue } from "./queue";
import { listDrQueueJobs } from "./store";
import type { DrQueueJobKind, DrTargetId } from "./types";

function mapIncidentToJob(
  input: RecordIncidentInput,
): { kind: DrQueueJobKind; targetId: DrTargetId } | null {
  switch (input.targetId) {
    case "openai":
      return { kind: "openai", targetId: "openai" };
    case "stripe":
    case "billing":
      return { kind: "stripe", targetId: input.targetId };
    case "supabase":
      return { kind: "supabase", targetId: "supabase" };
    case "cron":
      return { kind: "cron", targetId: "cron" };
    case "commander":
      return { kind: "commander", targetId: "commander" };
    case "automation":
      return { kind: "automation", targetId: "automation" };
    case "api":
      return { kind: "generic", targetId: "api" };
    default:
      return { kind: "generic", targetId: input.targetId as DrTargetId };
  }
}

/**
 * Called from monitoring incidents — enqueue retry, activate fallback, maybe maintenance.
 */
export function handleDisasterIncident(input: RecordIncidentInput): void {
  const mapped = mapIncidentToJob(input);
  if (!mapped) return;

  const job = enqueueDisasterJob({
    kind: mapped.kind,
    targetId: mapped.targetId,
    message: input.message,
    userId: input.userId,
    source: input.source ?? input.kind,
  });

  activateFallback({
    targetId: mapped.targetId,
    mode: "degraded",
    reason: input.message,
  });

  // First pass: leave this fresh job queued; older jobs may retry.
  processDisasterQueue({
    probe: (row) => row.id !== job.id && row.attempts >= 1,
  });

  const deadJobs = listDrQueueJobs().filter((row) => row.status === "dead");
  for (const dead of deadJobs) {
    markJobFallback(dead.id);
    activateFallback({
      targetId: dead.targetId,
      mode: "offline",
      reason: "Retries exhausted — graceful degraded mode",
    });
  }

  maybeEnableMaintenanceFromHealth();
}

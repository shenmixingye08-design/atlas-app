import {
  ensureAutomationsHydrated,
  persistAutomationsNow,
} from "@/lib/automations/durable";
import {
  listAutomationOwnerUserIds,
} from "@/lib/automations/global-durable";
import { serverAutomationRepository } from "@/lib/automations/repositories/server-automation-repository";
import { computeNextRunIso } from "@/lib/automations/schedule";
import { isAutomationSuspendedForUser } from "@/lib/billing/subscriptions/lifecycle";

import { evaluateWorkQueueAlerts } from "./alerts";
import { tagWorkQueueError } from "./failure-class";
import { enqueueDueAutomations } from "./scheduler";
import {
  drainWorkQueueHorizontal,
  type HorizontalDrainResult,
} from "./worker-scale";

/**
 * Production tick: schedule enqueue (light) then worker drain.
 * Replaces synchronous run-inside-cron for due automations.
 *
 * Minute Scheduler GHA already fans out /api/worker/drain ×3 — keep in-tick
 * fan-out modest to avoid Supabase MaxClients stampede (Production evidence:
 * drain_3_http=500 while drain_1/2 empty-200; tick work_queue_query_failed).
 */
export async function processWorkQueueTick(options?: {
  requestOrigin?: string | null;
  scheduleLimit?: number;
  workerLimit?: number;
  workerId?: string;
  /** Override horizontal fan-out (tests / ops). Default: 1 (GHA supplies scale). */
  workerFanOut?: number;
}): Promise<{
  schedule: Awaited<ReturnType<typeof enqueueDueAutomations>>;
  /** Aggregated horizontal drain (P2-03). */
  worker: HorizontalDrainResult;
  alerts: Awaited<ReturnType<typeof evaluateWorkQueueAlerts>>;
}> {
  let ownerIds: string[];
  try {
    ownerIds = await listAutomationOwnerUserIds();
  } catch (error) {
    throw tagWorkQueueError(error, "list_owners");
  }
  const memoryOwners = new Set(ownerIds);
  for (const row of await serverAutomationRepository.list()) {
    if (row.userId) memoryOwners.add(row.userId);
  }

  const candidates = [];
  try {
    for (const userId of memoryOwners) {
      await ensureAutomationsHydrated(userId);
      if (isAutomationSuspendedForUser(userId)) continue;
      const enabled = await serverAutomationRepository.list({
        enabled: true,
        userId,
      });
      for (const automation of enabled) {
        if (automation.schedule.kind !== "schedule") continue;
        candidates.push({
          automationId: automation.id,
          ownerId: userId,
          name: automation.name,
          nextRun: automation.nextRun,
          timezone: automation.schedule.timezone,
          enabled: automation.enabled,
          paused: !automation.enabled,
          assignment: automation.workflow?.assignment,
          offlineArtifacts: false,
        });
      }
    }
  } catch (error) {
    throw tagWorkQueueError(error, "hydrate_owners");
  }

  let schedule: Awaited<ReturnType<typeof enqueueDueAutomations>>;
  try {
    schedule = await enqueueDueAutomations({
      candidates,
      limit: options?.scheduleLimit,
      advanceNextRun: async (automationId, from) => {
        const automation = await serverAutomationRepository.findById(automationId);
        if (!automation || automation.schedule.kind !== "schedule") return null;
        const next = computeNextRunIso(automation.schedule, from);
        await serverAutomationRepository.update(automationId, {
          nextRun: next,
          status: automation.status === "running" ? "idle" : automation.status,
          lastError: null,
        });
        // P0-6: nextRun must be durable — Cold Start must not replay the same slot.
        if (automation.userId) {
          await persistAutomationsNow(automation.userId);
        }
        return next;
      },
    });
  } catch (error) {
    throw tagWorkQueueError(error, "enqueue_due");
  }

  // In-tick drain: default fan-out 1. Horizontal scale is GHA /api/worker/drain.
  let worker: HorizontalDrainResult;
  try {
    worker = await drainWorkQueueHorizontal({
      claimLimit: options?.workerLimit,
      fanOut: options?.workerFanOut ?? 1,
      workerIdPrefix: options?.workerId ?? undefined,
    });
  } catch (error) {
    throw tagWorkQueueError(error, "drain_horizontal");
  }

  // Keep legacy reliability processor for V1 job table during transition.
  try {
    const { processJobReliabilityTick } = await import(
      "@/lib/jobs/tick-processor"
    );
    await processJobReliabilityTick({
      requestOrigin: options?.requestOrigin ?? undefined,
    });
  } catch {
    // optional
  }

  try {
    const alerts = await evaluateWorkQueueAlerts();
    return { schedule, worker, alerts };
  } catch (error) {
    throw tagWorkQueueError(error, "evaluate_alerts");
  }
}

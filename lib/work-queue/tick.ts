import { ensureAutomationsHydrated } from "@/lib/automations/durable";
import {
  listAutomationOwnerUserIds,
} from "@/lib/automations/global-durable";
import { serverAutomationRepository } from "@/lib/automations/repositories/server-automation-repository";
import { computeNextRunIso } from "@/lib/automations/schedule";
import { isAutomationSuspendedForUser } from "@/lib/billing/subscriptions/lifecycle";

import { evaluateWorkQueueAlerts } from "./alerts";
import { WORK_QUEUE_DRAIN_ON_TICK_ENV } from "./constants";
import { presetToCron } from "@/lib/automations/schedule";
import { hydrateSchedulerGateFromStore } from "./scheduler-gate";
import { enqueueDueAutomations } from "./scheduler";
import { drainWorkQueue } from "./worker";

function shouldDrainOnTick(explicit?: boolean): boolean {
  if (typeof explicit === "boolean") return explicit;
  const env = process.env[WORK_QUEUE_DRAIN_ON_TICK_ENV]?.trim().toLowerCase();
  if (env === "false" || env === "0") return false;
  return true;
}

/**
 * Production tick: schedule enqueue (light) then optional worker drain.
 * Set ATLAS_WORK_QUEUE_DRAIN_ON_TICK=false + call /api/worker/drain for
 * an independent worker path (preferred for long work).
 */
export async function processWorkQueueTick(options?: {
  requestOrigin?: string | null;
  scheduleLimit?: number;
  workerLimit?: number;
  workerId?: string;
  /** When false, only enqueue — do not drain in this request. */
  drain?: boolean;
}): Promise<{
  schedule: Awaited<ReturnType<typeof enqueueDueAutomations>>;
  worker: Awaited<ReturnType<typeof drainWorkQueue>> | null;
  alerts: Awaited<ReturnType<typeof evaluateWorkQueueAlerts>>;
  drained: boolean;
}> {
  // Sync Fail-Closed gate from durable meta (not process memory alone).
  await hydrateSchedulerGateFromStore();

  const ownerIds = await listAutomationOwnerUserIds();
  const memoryOwners = new Set(ownerIds);
  for (const row of await serverAutomationRepository.list()) {
    if (row.userId) memoryOwners.add(row.userId);
  }

  const candidates = [];
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
        cronExpression:
          automation.schedule.cron ?? presetToCron(automation.schedule.preset),
        presetType: automation.schedule.preset.type,
      });
    }
  }

  const schedule = await enqueueDueAutomations({
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
      return next;
    },
  });

  const drain = shouldDrainOnTick(options?.drain);
  const worker = drain
    ? await drainWorkQueue({
        limit: options?.workerLimit,
        workerId: options?.workerId,
      })
    : null;

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

  const alerts = await evaluateWorkQueueAlerts();
  return { schedule, worker, alerts, drained: drain };
}

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
import { enqueueDueAutomations } from "./scheduler";
import { drainWorkQueue } from "./worker";

/**
 * Production tick: schedule enqueue (light) then worker drain (step-sized).
 * Replaces synchronous run-inside-cron for due automations.
 */
export async function processWorkQueueTick(options?: {
  requestOrigin?: string | null;
  scheduleLimit?: number;
  workerLimit?: number;
  workerId?: string;
}): Promise<{
  schedule: Awaited<ReturnType<typeof enqueueDueAutomations>>;
  worker: Awaited<ReturnType<typeof drainWorkQueue>>;
  alerts: Awaited<ReturnType<typeof evaluateWorkQueueAlerts>>;
}> {
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
      // P0-6: nextRun must be durable — Cold Start must not replay the same slot.
      if (automation.userId) {
        await persistAutomationsNow(automation.userId);
      }
      return next;
    },
  });

  const worker = await drainWorkQueue({
    limit: options?.workerLimit,
    workerId: options?.workerId,
  });

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
  return { schedule, worker, alerts };
}

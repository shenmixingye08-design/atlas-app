/**
 * Create V2 schedule Runs for due automations and advance nextRunAt.
 * Must be called from cron/tick — dispatch alone does not create occurrences.
 */

import "server-only";

import { appendAutomationAudit } from "@/lib/automation-platform/audit/log";
import {
  ensureAutomationsV2Hydrated,
  persistAutomationV2Now,
} from "@/lib/automation-platform/durable";
import { ensureAutomationRunsV2Hydrated } from "@/lib/automation-platform/durable-runs";
import { dispatchAutomationRuns } from "@/lib/automation-platform/execution/dispatch";
import { reclaimStuckRunningRuns } from "@/lib/automation-platform/operations/reclaim-stuck-runs";
import {
  memoryListDueActiveAutomations,
} from "@/lib/automation-platform/repository/memory-store";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import {
  buildFeatureAccessContext,
  isFeatureEnabled,
} from "@/lib/feature-flags/access";

export type DueScheduleTickResult = {
  due: number;
  enqueued: number;
  deduped: number;
  skippedPaused: number;
  failed: number;
  dispatched: number;
  reclaimed: number;
  firings: Array<{
    automationId: string;
    userId: string;
    scheduledAt: string;
    actualStartedAt: string;
    delayMs: number;
    occurrenceKey: string | null;
    runId: string;
    status: string;
    timezone: string;
    created: boolean;
  }>;
};

/**
 * Process due V2 schedule occurrences for automations already hydrated
 * into the process store. Does not invent wall-clock waits.
 */
export async function processDueScheduledAutomationsV2(options?: {
  nowMs?: number;
  limit?: number;
  dispatch?: boolean;
  /** Optional userIds to hydrate from durable storage before scanning. */
  hydrateUserIds?: string[];
}): Promise<DueScheduleTickResult> {
  const nowMs = options?.nowMs ?? Date.now();
  const context = buildFeatureAccessContext(null);
  const result: DueScheduleTickResult = {
    due: 0,
    enqueued: 0,
    deduped: 0,
    skippedPaused: 0,
    failed: 0,
    dispatched: 0,
    reclaimed: 0,
    firings: [],
  };

  if (!isFeatureEnabled("automation_v2_enabled", context)) {
    return result;
  }

  for (const userId of options?.hydrateUserIds ?? []) {
    await ensureAutomationsV2Hydrated(userId);
    await ensureAutomationRunsV2Hydrated(userId);
  }

  const due = memoryListDueActiveAutomations(nowMs, options?.limit ?? 50);
  result.due = due.length;
  const runIds: string[] = [];

  for (const automation of due) {
    if (automation.status !== "active") {
      result.skippedPaused += 1;
      continue;
    }
    const scheduledAt = automation.nextRunAt!;
    const delayMs = Math.max(0, nowMs - Date.parse(scheduledAt));
    try {
      const enqueued = await automationPlatformService.enqueueRun({
        userId: automation.userId,
        automationId: automation.id,
        triggerType: "schedule",
        scheduledFor: scheduledAt,
        context,
        dispatch: false,
      });
      if (enqueued.created) {
        result.enqueued += 1;
        runIds.push(enqueued.run.id);
      } else {
        result.deduped += 1;
        // Avoid tight loops when occurrence already exists: advance nextRunAt.
        const { computeNextRunIsoFromTrigger } = await import(
          "@/lib/automation-platform/schedule/compute"
        );
        const next = computeNextRunIsoFromTrigger(
          automation.trigger,
          new Date(Math.max(nowMs, Date.parse(scheduledAt) + 1)),
        );
        persistAutomationV2Now({
          ...automation,
          nextRunAt: next,
          updatedAt: new Date().toISOString(),
        });
      }
      result.firings.push({
        automationId: automation.id,
        userId: automation.userId,
        scheduledAt,
        actualStartedAt: new Date(nowMs).toISOString(),
        delayMs,
        occurrenceKey: enqueued.run.scheduleOccurrenceKey,
        runId: enqueued.run.id,
        status: enqueued.run.status,
        timezone: automation.trigger.timezone,
        created: enqueued.created,
      });
      appendAutomationAudit({
        actorUserId: null,
        action: "automation.schedule.fire",
        automationId: automation.id,
        runId: enqueued.run.id,
        outcome: "success",
        errorCode: enqueued.created
          ? null
          : "automation_duplicate_occurrence",
        meta: {
          scheduledAt,
          delayMs,
          occurrenceKey: enqueued.run.scheduleOccurrenceKey,
          created: enqueued.created,
        },
      });
    } catch (error) {
      result.failed += 1;
      // Advance nextRunAt even on enqueue failure to avoid tight retry loops
      // for permanent definition errors — temporary errors will still recompute.
      const { computeNextRunIsoFromTrigger } = await import(
        "@/lib/automation-platform/schedule/compute"
      );
      const next = computeNextRunIsoFromTrigger(
        automation.trigger,
        new Date(Math.max(nowMs, Date.parse(scheduledAt) + 1)),
      );
      persistAutomationV2Now({
        ...automation,
        nextRunAt: next,
        updatedAt: new Date().toISOString(),
      });
      appendAutomationAudit({
        actorUserId: null,
        action: "automation.schedule.fire",
        automationId: automation.id,
        runId: null,
        outcome: "error",
        errorCode:
          error instanceof Error ? error.name : "automation_run_failed",
        meta: {
          scheduledAt,
          message: error instanceof Error ? error.message.slice(0, 200) : "error",
        },
      });
    }
  }

  // Worker restart safety: reclaim stuck running runs before new dispatch.
  const reclaimed = reclaimStuckRunningRuns({
    nowMs,
    userIds: options?.hydrateUserIds,
  });
  result.reclaimed = reclaimed.reclaimed;
  for (const id of reclaimed.runIds) {
    if (!runIds.includes(id)) runIds.push(id);
  }

  if (options?.dispatch !== false && runIds.length > 0) {
    const dispatched = await dispatchAutomationRuns({ runIds });
    result.dispatched = dispatched.processed;
  }

  return result;
}

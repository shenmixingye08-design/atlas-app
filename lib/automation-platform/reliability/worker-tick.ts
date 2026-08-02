/**
 * Persistent worker tick: hydrate → recover → due enqueue → leased dispatch.
 * Designed to survive cold start / deploy / restart via durable hydrate + leases.
 */

import "server-only";

import {
  DISPATCH_BATCH_LIMIT,
  DUE_BATCH_LIMIT,
} from "@/lib/automation-platform/reliability/constants";
import { evaluateScheduleAlerts } from "@/lib/automation-platform/reliability/alerts";
import { hydrateLeaseStore } from "@/lib/automation-platform/reliability/lease-store";
import {
  getScheduleReliabilitySnapshot,
  recordSchedulerTick,
  recordWorkerActivity,
} from "@/lib/automation-platform/reliability/metrics";
import { recoverStaleRunningRuns } from "@/lib/automation-platform/reliability/recovery";
import { processDueScheduledAutomationsV2 } from "@/lib/automation-platform/schedule/due-tick";
import { dispatchAutomationRunsWithLease } from "@/lib/automation-platform/reliability/leased-dispatch";

export type ScheduleWorkerTickResult = {
  ok: boolean;
  recovery: Awaited<ReturnType<typeof recoverStaleRunningRuns>>;
  due: Awaited<ReturnType<typeof processDueScheduledAutomationsV2>>;
  dispatch: Awaited<ReturnType<typeof dispatchAutomationRunsWithLease>>;
  metrics: ReturnType<typeof getScheduleReliabilitySnapshot>;
  alerts: Awaited<ReturnType<typeof evaluateScheduleAlerts>>;
  workerId: string;
  durationMs: number;
};

function resolveWorkerId(): string {
  const scope = globalThis as typeof globalThis & {
    __atlasScheduleWorkerId?: string;
  };
  if (!scope.__atlasScheduleWorkerId) {
    scope.__atlasScheduleWorkerId = `worker_${crypto.randomUUID().slice(0, 8)}`;
  }
  return scope.__atlasScheduleWorkerId;
}

export async function processScheduleReliabilityWorkerTick(options?: {
  nowMs?: number;
  dueLimit?: number;
  dispatchLimit?: number;
  requestOrigin?: string | null;
  workerId?: string;
}): Promise<ScheduleWorkerTickResult> {
  const started = Date.now();
  const workerId = options?.workerId ?? resolveWorkerId();
  const nowMs = options?.nowMs ?? started;

  await hydrateLeaseStore();
  recordWorkerActivity(nowMs);

  const recovery = await recoverStaleRunningRuns({ nowMs });

  const due = await processDueScheduledAutomationsV2({
    nowMs,
    limit: options?.dueLimit ?? DUE_BATCH_LIMIT,
    dispatch: false,
    requestOrigin: options?.requestOrigin,
  });

  const dispatch = await dispatchAutomationRunsWithLease({
    limit: options?.dispatchLimit ?? DISPATCH_BATCH_LIMIT,
    requestOrigin: options?.requestOrigin,
    workerId,
  });

  const metrics = getScheduleReliabilitySnapshot(Date.now());
  const alerts = await evaluateScheduleAlerts(metrics);
  const ok = true;
  recordSchedulerTick(ok, Date.now());

  return {
    ok,
    recovery,
    due,
    dispatch,
    metrics,
    alerts,
    workerId,
    durationMs: Date.now() - started,
  };
}

import "server-only";

import { randomUUID } from "node:crypto";

import { serverAutomationRepository } from "@/lib/automations/repositories/server-automation-repository";
import { WORK_QUEUE_DEFAULT_MAX_ATTEMPTS } from "@/lib/work-queue/constants";
import { getWorkQueueStore } from "@/lib/work-queue/store";
import { defaultAutomationSteps } from "@/lib/work-queue/steps/execute-step";
import { drainWorkQueue } from "@/lib/work-queue/worker";

import { calculateNextRunAtIsoFromV1Schedule } from "../calculate-next-run-at";
import { getSchedulerCoreStore } from "../durable";
import { newOutboxId } from "../ids";
import { logSchedulerCore } from "../observability";
import type { SchedulerOutboxRow } from "../types";

import {
  recordBridgeDispatch,
  recordBridgeEnqueue,
  recordBridgeLease,
  recordBridgeQueueWait,
  recordBridgeRetry,
} from "./metrics";
import type {
  AdvanceNextRunPayload,
  DispatchEnqueuePayload,
  DispatcherResult,
  EnqueueResult,
} from "./types";

function isDispatcherDisabled(): boolean {
  return (
    process.env.SCHEDULER_BRIDGE_DISPATCHER_DISABLED?.trim().toLowerCase() ===
    "true"
  );
}

function isQueueDisabled(): boolean {
  return (
    process.env.SCHEDULER_BRIDGE_QUEUE_DISABLED?.trim().toLowerCase() ===
    "true"
  );
}

function asDispatchPayload(
  payload: Record<string, unknown>,
): DispatchEnqueuePayload | null {
  if (payload.action !== "dispatch_enqueue") return null;
  return payload as unknown as DispatchEnqueuePayload;
}

function asAdvancePayload(
  payload: Record<string, unknown>,
): AdvanceNextRunPayload | null {
  if (payload.action !== "advance_next_run") return null;
  return payload as unknown as AdvanceNextRunPayload;
}

async function dispatchEnqueueItem(
  item: SchedulerOutboxRow,
): Promise<EnqueueResult> {
  const started = Date.now();
  const dispatchStarted = Date.parse(item.createdAt);
  const payload = asDispatchPayload(item.payload);
  if (!payload) {
    await getSchedulerCoreStore().markOutboxFailed(
      item.outboxId,
      "invalid_outbox_payload",
    );
    return {
      ok: false,
      enqueueResult: "failed",
      queueId: "work-queue",
      jobId: null,
      runId: null,
      occurrenceId: item.occurrenceKey,
      createdAt: new Date().toISOString(),
      priority: 0,
      status: null,
      retryPolicy: { maxAttempts: WORK_QUEUE_DEFAULT_MAX_ATTEMPTS, attempt: 0 },
      errorCode: "invalid_outbox_payload",
      enqueueLatencyMs: 0,
      dispatchLatencyMs: Date.now() - dispatchStarted,
    };
  }

  if (isQueueDisabled()) {
    recordBridgeRetry();
    await getSchedulerCoreStore().markOutboxFailed(item.outboxId, "queue_disabled");
    recordBridgeEnqueue(0, "failed");
    return {
      ok: false,
      enqueueResult: "failed",
      queueId: "work-queue",
      jobId: null,
      runId: null,
      occurrenceId: payload.occurrenceKey,
      createdAt: new Date().toISOString(),
      priority: payload.priority,
      status: null,
      retryPolicy: {
        maxAttempts: payload.maxAttempts,
        attempt: item.attempt + 1,
      },
      errorCode: "queue_disabled",
      enqueueLatencyMs: 0,
      dispatchLatencyMs: Date.now() - dispatchStarted,
    };
  }

  const claimed = await getSchedulerCoreStore().markOutboxProcessing(
    item.outboxId,
  );
  if (!claimed) {
    return {
      ok: false,
      enqueueResult: "failed",
      queueId: "work-queue",
      jobId: item.jobId || null,
      runId: item.runId || null,
      occurrenceId: payload.occurrenceKey,
      createdAt: new Date().toISOString(),
      priority: payload.priority,
      status: null,
      retryPolicy: {
        maxAttempts: payload.maxAttempts,
        attempt: item.attempt,
      },
      errorCode: "outbox_claim_failed",
      enqueueLatencyMs: 0,
      dispatchLatencyMs: Date.now() - dispatchStarted,
    };
  }

  const enqueueStarted = Date.now();
  try {
    const queue = getWorkQueueStore();
    const { job, created } = await queue.enqueue({
      ownerId: payload.ownerId,
      automationId: payload.automationId,
      occurrenceKey: payload.occurrenceKey,
      scheduleId: payload.automationId,
      scheduledAt: payload.scheduledAt,
      priority: payload.priority,
      maxAttempts: payload.maxAttempts,
      payload: {
        kind: "automation",
        automationName: payload.automationName,
        triggerType: "automation",
        offlineArtifacts: payload.offlineArtifacts,
      },
      steps: defaultAutomationSteps(payload.offlineArtifacts),
    });
    const enqueueLatencyMs = Date.now() - enqueueStarted;
    const dispatchLatencyMs = Date.now() - dispatchStarted;
    recordBridgeEnqueue(enqueueLatencyMs, created ? "created" : "duplicate");
    recordBridgeDispatch(dispatchLatencyMs);
    if (payload.scheduledAt) {
      recordBridgeQueueWait(
        Math.max(0, Date.now() - Date.parse(payload.scheduledAt)),
      );
    }

    await getSchedulerCoreStore().updateOutboxDispatchResult(item.outboxId, {
      jobId: job.jobId,
      runId: job.runId,
      payload: {
        lifecycle: created ? "Queued" : "Queued",
        enqueueResult: created ? "created" : "duplicate",
      },
    });
    await getSchedulerCoreStore().markOutboxDelivered(
      item.outboxId,
      new Date().toISOString(),
    );

    // Occurrence / Run / Job linkage after durable queue accept.
    try {
      await getSchedulerCoreStore().insertOccurrenceLink({
        tickId: item.tickId,
        occurrenceKey: payload.occurrenceKey,
        automationId: payload.automationId,
        ownerId: payload.ownerId,
        runId: job.runId,
        jobId: job.jobId,
        scheduledAt: payload.scheduledAt,
        created,
        misfirePolicy: "run_once_immediately",
        misfireAction: created ? "enqueue" : "duplicate_skip",
        reason: created ? null : "duplicate_occurrence",
      });
    } catch {
      // Unique occurrence link already recorded — safe for retry/dedupe.
    }

    logSchedulerCore({
      event: created ? "JOB_CREATED" : "OCCURRENCE_DUPLICATE_SKIPPED",
      schedulerTickId: item.tickId,
      automationId: payload.automationId,
      occurrenceId: payload.occurrenceKey,
      runId: job.runId,
      jobId: job.jobId,
      status: job.status,
      extra: {
        lifecycle: "Queued",
        enqueueResult: created ? "created" : "duplicate",
        enqueueLatencyMs,
        dispatchLatencyMs,
      },
    });

    // Queue accepted → schedule nextRun advance via Outbox (never before enqueue).
    await getSchedulerCoreStore().insertOutbox({
      outboxId: newOutboxId(),
      tickId: item.tickId,
      occurrenceKey: payload.occurrenceKey,
      automationId: payload.automationId,
      ownerId: payload.ownerId,
      runId: job.runId,
      jobId: job.jobId,
      scheduledAt: payload.scheduledAt,
      payload: {
        action: "advance_next_run",
        basis: "scheduledAt",
        scheduledAt: payload.scheduledAt,
      } satisfies AdvanceNextRunPayload,
      status: "pending",
      availableAt: new Date().toISOString(),
      attempt: 0,
      dispatchedAt: null,
      errorCode: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      enqueueResult: created ? "created" : "duplicate",
      queueId: queue.kind === "postgres" ? "atlas_work_queue_jobs" : "file-work-queue",
      jobId: job.jobId,
      runId: job.runId,
      occurrenceId: payload.occurrenceKey,
      createdAt: job.createdAt,
      priority: job.priority,
      status: job.status,
      retryPolicy: {
        maxAttempts: job.maxAttempts,
        attempt: job.attempt,
      },
      errorCode: null,
      enqueueLatencyMs,
      dispatchLatencyMs,
    };
  } catch (error) {
    const enqueueLatencyMs = Date.now() - enqueueStarted;
    recordBridgeEnqueue(enqueueLatencyMs, "failed");
    recordBridgeRetry();
    const code =
      error instanceof Error ? error.message.slice(0, 80) : "enqueue_failed";
    await getSchedulerCoreStore().markOutboxFailed(item.outboxId, code);
    logSchedulerCore({
      event: "SCHEDULER_TICK_FAILED",
      schedulerTickId: item.tickId,
      automationId: payload.automationId,
      occurrenceId: payload.occurrenceKey,
      errorCode: code,
      extra: { phase: "queue_dispatch" },
    });
    return {
      ok: false,
      enqueueResult: "failed",
      queueId: "work-queue",
      jobId: null,
      runId: null,
      occurrenceId: payload.occurrenceKey,
      createdAt: new Date().toISOString(),
      priority: payload.priority,
      status: null,
      retryPolicy: {
        maxAttempts: payload.maxAttempts,
        attempt: item.attempt + 1,
      },
      errorCode: code,
      enqueueLatencyMs,
      dispatchLatencyMs: Date.now() - dispatchStarted,
    };
  } finally {
    void started;
  }
}

async function dispatchAdvanceItem(item: SchedulerOutboxRow): Promise<boolean> {
  const payload = asAdvancePayload(item.payload);
  if (!payload) {
    await getSchedulerCoreStore().markOutboxFailed(
      item.outboxId,
      "invalid_advance_payload",
    );
    return false;
  }
  const claimed = await getSchedulerCoreStore().markOutboxProcessing(
    item.outboxId,
  );
  if (!claimed) return false;

  try {
    const automation = await serverAutomationRepository.findById(
      item.automationId,
    );
    if (!automation || automation.schedule.kind !== "schedule") {
      await getSchedulerCoreStore().markOutboxFailed(
        item.outboxId,
        "automation_missing",
      );
      return false;
    }
    const from = new Date(Date.parse(payload.scheduledAt) + 1);
    const next = calculateNextRunAtIsoFromV1Schedule(automation.schedule, from);
    await serverAutomationRepository.update(item.automationId, {
      nextRun: next,
      status: automation.status === "running" ? "idle" : automation.status,
      lastError: null,
    });
    await getSchedulerCoreStore().updateScheduleNextRun(
      item.automationId,
      next,
    );
    await getSchedulerCoreStore().markOutboxDelivered(
      item.outboxId,
      new Date().toISOString(),
    );
    logSchedulerCore({
      event: "NEXT_RUN_UPDATED",
      schedulerTickId: item.tickId,
      automationId: item.automationId,
      occurrenceId: item.occurrenceKey,
      runId: item.runId,
      jobId: item.jobId,
      status: "ok",
      extra: { nextRunAt: next, basis: "scheduledAt" },
    });
    return true;
  } catch (error) {
    await getSchedulerCoreStore().markOutboxFailed(
      item.outboxId,
      error instanceof Error ? error.message.slice(0, 80) : "advance_failed",
    );
    return false;
  }
}

/**
 * Outbox Dispatcher — DB commit後に Durable Queue へ投入し、Worker lease を開始可能にする。
 * Worker business logic は変更しない（既存 drainWorkQueue / leaseJobs のみ使用）。
 */
export async function dispatchSchedulerOutbox(options?: {
  limit?: number;
  startWorkerLease?: boolean;
  workerLimit?: number;
}): Promise<DispatcherResult> {
  const result: DispatcherResult = {
    scanned: 0,
    dispatched: 0,
    duplicates: 0,
    failed: 0,
    retried: 0,
    nextRunAdvanced: 0,
    leaseStarted: 0,
    workerCompleted: 0,
    workerFailed: 0,
    enqueueResults: [],
  };

  if (isDispatcherDisabled()) {
    return result;
  }

  const core = getSchedulerCoreStore();
  const pending = await core.listPendingOutbox(options?.limit ?? 100);
  result.scanned = pending.length;

  // Pass 1: enqueue to durable queue
  for (const item of pending) {
    if (item.payload.action === "dispatch_enqueue") {
      if (item.attempt > 0) result.retried += 1;
      const enq = await dispatchEnqueueItem(item);
      result.enqueueResults.push(enq);
      if (enq.enqueueResult === "created") result.dispatched += 1;
      else if (enq.enqueueResult === "duplicate") result.duplicates += 1;
      else result.failed += 1;
    }
  }

  // Pass 2: advance nextRun only for successfully queued work
  const pendingAdvance = await core.listPendingOutbox(options?.limit ?? 100);
  for (const item of pendingAdvance) {
    if (item.payload.action === "advance_next_run") {
      const ok = await dispatchAdvanceItem(item);
      if (ok) result.nextRunAdvanced += 1;
      else result.failed += 1;
    }
  }

  // Pass 3: Worker obtains work ONLY from Durable Queue (leaseJobs).
  // No Run/Job table bypass — leaseJobs is the sole acquisition path.
  if (options?.startWorkerLease !== false) {
    const leaseStartedAt = Date.now();
    const drained = await drainWorkQueue({
      limit: options?.workerLimit,
      workerId: `bridge_${randomUUID().slice(0, 8)}`,
    });
    result.leaseStarted = drained.leased;
    result.workerCompleted = drained.completed;
    result.workerFailed = drained.failed;
    if (drained.leased > 0) {
      recordBridgeLease(Date.now() - leaseStartedAt);
      logSchedulerCore({
        event: "SCHEDULER_TICK_COMPLETED",
        status: "ok",
        extra: {
          lifecycle: "Leased",
          leased: drained.leased,
          completed: drained.completed,
          failed: drained.failed,
        },
      });
    }
  }

  return result;
}

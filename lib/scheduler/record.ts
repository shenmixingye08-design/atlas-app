import { randomUUID } from "crypto";

import { classifySchedulerFailure } from "./failure-classify";
import {
  appendSchedulerExecution,
  markSchedulerJobStarted,
  markSchedulerTickOutcome,
  markSchedulerTickStarted,
  recordQueueDepthSample,
} from "./history-store";
import type {
  SchedulerExecutionRecord,
  SchedulerExecutionSource,
  SchedulerFailureReason,
} from "./types";
import { buildScheduleId, getSchedulerWorkerId } from "./worker-id";

export type RecordSchedulerExecutionInput = {
  jobId?: string | null;
  runId?: string | null;
  scheduleId?: string | null;
  automationId?: string | null;
  scheduledAt: string;
  startedAt?: string;
  endedAt?: string;
  success: boolean;
  failureReason?: SchedulerFailureReason | null;
  failureMessage?: string | null;
  error?: unknown;
  retryCount?: number;
  workerId?: string;
  source: SchedulerExecutionSource;
  queueDepth?: number;
};

/** Persist one Scheduler execution evidence row (required fields enforced). */
export function recordSchedulerExecution(
  input: RecordSchedulerExecutionInput,
): SchedulerExecutionRecord {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const endedAt = input.endedAt ?? new Date().toISOString();
  const scheduledMs = Date.parse(input.scheduledAt);
  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);
  const delayMs = Number.isFinite(scheduledMs)
    ? Math.max(0, startedMs - scheduledMs)
    : 0;
  const durationMs = Number.isFinite(endedMs - startedMs)
    ? Math.max(0, endedMs - startedMs)
    : 0;

  const failureReason = input.success
    ? null
    : (input.failureReason ??
      (input.error != null
        ? classifySchedulerFailure(input.error)
        : classifySchedulerFailure(input.failureMessage ?? "unknown")));

  const automationId = input.automationId ?? null;
  const scheduleId =
    input.scheduleId ??
    (automationId
      ? buildScheduleId({
          automationId,
          scheduledAt: input.scheduledAt,
        })
      : `schedule:${input.scheduledAt}`);

  const record: SchedulerExecutionRecord = {
    id: randomUUID(),
    jobId: input.jobId ?? `job:${scheduleId}`,
    runId: input.runId ?? `run:${scheduleId}`,
    scheduleId,
    scheduledAt: input.scheduledAt,
    startedAt,
    endedAt,
    delayMs,
    success: input.success,
    failureReason,
    failureMessage: input.success
      ? null
      : (input.failureMessage ??
        (typeof input.error === "string"
          ? input.error.slice(0, 240)
          : input.error instanceof Error
            ? input.error.message.slice(0, 240)
            : failureReason)),
    retryCount: Math.max(0, input.retryCount ?? 0),
    workerId: input.workerId ?? getSchedulerWorkerId(),
    durationMs,
    source: input.source,
    automationId,
    createdAt: new Date().toISOString(),
  };

  markSchedulerJobStarted({
    jobId: record.jobId,
    runId: record.runId,
    scheduleId: record.scheduleId,
  });
  appendSchedulerExecution(record);
  if (typeof input.queueDepth === "number") {
    recordQueueDepthSample(input.queueDepth);
  }
  return record;
}

/** Call when Scheduler claims/starts a scheduled job (before work finishes). */
export function noteSchedulerJobStarted(input: {
  jobId?: string | null;
  runId?: string | null;
  scheduleId?: string | null;
}): void {
  markSchedulerJobStarted(input);
}

/** Mark tick start — required before any scheduled completed is allowed. */
export function beginSchedulerTick(at = new Date().toISOString()): void {
  markSchedulerTickStarted(at);
}

export function finishSchedulerTick(input: {
  ok: boolean;
  error?: string | null;
  at?: string;
}): void {
  markSchedulerTickOutcome(input);
}

/**
 * Structured execution log for schedule reliability (runId, retries, errors).
 */

import {
  EXECUTION_EVENT_LIMIT,
} from "@/lib/automation-platform/reliability/constants";
import type { FailureClass } from "@/lib/automation-platform/reliability/failure-class";

export type ExecutionEventStep =
  | "enqueue"
  | "claim"
  | "heartbeat"
  | "step"
  | "retry"
  | "recover"
  | "complete"
  | "fail";

export type ExecutionEvent = {
  id: string;
  at: string;
  runId: string;
  jobId: string | null;
  ownerId: string;
  automationId: string;
  step: ExecutionEventStep;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  failureClass: FailureClass | null;
  meta?: Record<string, string | number | boolean | null>;
};

function getBuffer(): ExecutionEvent[] {
  const scope = globalThis as typeof globalThis & {
    __atlasScheduleExecutionEvents?: ExecutionEvent[];
  };
  if (!scope.__atlasScheduleExecutionEvents) {
    scope.__atlasScheduleExecutionEvents = [];
  }
  return scope.__atlasScheduleExecutionEvents;
}

export function resetExecutionEventsForTests(): void {
  const scope = globalThis as typeof globalThis & {
    __atlasScheduleExecutionEvents?: ExecutionEvent[];
  };
  scope.__atlasScheduleExecutionEvents = [];
}

export function recordExecutionEvent(
  input: Omit<ExecutionEvent, "id" | "at"> & { id?: string; at?: string },
): ExecutionEvent {
  const event: ExecutionEvent = {
    id: input.id ?? crypto.randomUUID(),
    at: input.at ?? new Date().toISOString(),
    runId: input.runId,
    jobId: input.jobId,
    ownerId: input.ownerId,
    automationId: input.automationId,
    step: input.step,
    status: input.status,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs: input.durationMs,
    retryCount: input.retryCount,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage
      ? input.errorMessage.slice(0, 300)
      : null,
    failureClass: input.failureClass,
    meta: input.meta,
  };
  const buf = getBuffer();
  buf.unshift(event);
  if (buf.length > EXECUTION_EVENT_LIMIT) {
    buf.length = EXECUTION_EVENT_LIMIT;
  }
  return event;
}

export function listExecutionEvents(options?: {
  limit?: number;
  automationId?: string;
  runId?: string;
}): ExecutionEvent[] {
  const limit = options?.limit ?? 100;
  return getBuffer()
    .filter((event) => {
      if (options?.automationId && event.automationId !== options.automationId) {
        return false;
      }
      if (options?.runId && event.runId !== options.runId) return false;
      return true;
    })
    .slice(0, limit);
}

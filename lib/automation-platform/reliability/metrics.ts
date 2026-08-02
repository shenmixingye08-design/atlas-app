/**
 * In-process schedule/worker metrics with p95/p99 helpers.
 */

import {
  METRICS_SAMPLE_LIMIT,
  SCHEDULER_STALE_MS,
  WORKER_STALE_MS,
} from "@/lib/automation-platform/reliability/constants";
import type { FailureClass } from "@/lib/automation-platform/reliability/failure-class";
import { listActiveLeases } from "@/lib/automation-platform/reliability/lease-store";
import {
  memoryListAllAutomations,
  memoryListDispatchableRuns,
} from "@/lib/automation-platform/repository/memory-store";

type DurationSample = { at: number; durationMs: number; ok: boolean };
type DelaySample = { at: number; delayMs: number };

type MetricsState = {
  durations: DurationSample[];
  scheduleDelays: DelaySample[];
  failuresByClass: Record<FailureClass, number>;
  retries: number;
  recoveries: number;
  recoverySuccesses: number;
  duplicates: number;
  claims: number;
  lastSchedulerTickAt: number | null;
  lastSchedulerOk: boolean | null;
  lastWorkerActivityAt: number | null;
  tickCount: number;
};

function emptyFailures(): Record<FailureClass, number> {
  return {
    storage: 0,
    ai: 0,
    timeout: 0,
    permission: 0,
    network: 0,
    validation: 0,
    external: 0,
    unknown: 0,
  };
}

function getState(): MetricsState {
  const scope = globalThis as typeof globalThis & {
    __atlasScheduleMetrics?: MetricsState;
  };
  if (!scope.__atlasScheduleMetrics) {
    scope.__atlasScheduleMetrics = {
      durations: [],
      scheduleDelays: [],
      failuresByClass: emptyFailures(),
      retries: 0,
      recoveries: 0,
      recoverySuccesses: 0,
      duplicates: 0,
      claims: 0,
      lastSchedulerTickAt: null,
      lastSchedulerOk: null,
      lastWorkerActivityAt: null,
      tickCount: 0,
    };
  }
  return scope.__atlasScheduleMetrics;
}

export function resetScheduleMetricsForTests(): void {
  const scope = globalThis as typeof globalThis & {
    __atlasScheduleMetrics?: MetricsState;
  };
  scope.__atlasScheduleMetrics = undefined;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? null;
}

export function recordSchedulerTick(ok: boolean, nowMs = Date.now()): void {
  const state = getState();
  state.lastSchedulerTickAt = nowMs;
  state.lastSchedulerOk = ok;
  state.tickCount += 1;
}

export function recordWorkerActivity(nowMs = Date.now()): void {
  getState().lastWorkerActivityAt = nowMs;
}

export function recordClaim(): void {
  getState().claims += 1;
  recordWorkerActivity();
}

export function recordRetry(): void {
  getState().retries += 1;
}

export function recordDuplicate(): void {
  getState().duplicates += 1;
}

export function recordRecovery(success: boolean): void {
  const state = getState();
  state.recoveries += 1;
  if (success) state.recoverySuccesses += 1;
}

export function recordRunDuration(input: {
  durationMs: number;
  ok: boolean;
  failureClass?: FailureClass | null;
}): void {
  const state = getState();
  state.durations.unshift({
    at: Date.now(),
    durationMs: input.durationMs,
    ok: input.ok,
  });
  if (state.durations.length > METRICS_SAMPLE_LIMIT) {
    state.durations.length = METRICS_SAMPLE_LIMIT;
  }
  if (!input.ok && input.failureClass) {
    state.failuresByClass[input.failureClass] += 1;
  }
}

export function recordScheduleDelay(delayMs: number): void {
  const state = getState();
  state.scheduleDelays.unshift({ at: Date.now(), delayMs });
  if (state.scheduleDelays.length > METRICS_SAMPLE_LIMIT) {
    state.scheduleDelays.length = METRICS_SAMPLE_LIMIT;
  }
}

export type ScheduleReliabilitySnapshot = {
  at: string;
  queueLength: number;
  runningCount: number;
  activeLeaseCount: number;
  retryCount: number;
  failureRate: number;
  avgDurationMs: number | null;
  p95DurationMs: number | null;
  p99DurationMs: number | null;
  p95ScheduleDelayMs: number | null;
  p99ScheduleDelayMs: number | null;
  recoverySuccessRate: number | null;
  duplicateRate: number | null;
  failuresByClass: Record<FailureClass, number>;
  scheduler: {
    lastTickAt: string | null;
    lastOk: boolean | null;
    stale: boolean;
    tickCount: number;
  };
  worker: {
    lastActivityAt: string | null;
    stale: boolean;
  };
  dueAutomationCount: number;
};

export function getScheduleReliabilitySnapshot(
  nowMs = Date.now(),
): ScheduleReliabilitySnapshot {
  const state = getState();
  const queued = memoryListDispatchableRuns(10_000);
  const runningCount = listActiveLeases().length;
  const durations = state.durations.map((d) => d.durationMs).sort((a, b) => a - b);
  const okCount = state.durations.filter((d) => d.ok).length;
  const failCount = state.durations.length - okCount;
  const failureRate =
    state.durations.length === 0 ? 0 : failCount / state.durations.length;
  const avgDurationMs =
    durations.length === 0
      ? null
      : Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  const delays = state.scheduleDelays
    .map((d) => d.delayMs)
    .sort((a, b) => a - b);
  const recoverySuccessRate =
    state.recoveries === 0
      ? null
      : state.recoverySuccesses / state.recoveries;
  const duplicateRate =
    state.claims === 0 ? null : state.duplicates / Math.max(1, state.claims);

  const dueAutomationCount = memoryListAllAutomations().filter((item) => {
    if (item.status !== "active" || item.trigger.type !== "schedule") {
      return false;
    }
    if (!item.nextRunAt) return false;
    return Date.parse(item.nextRunAt) <= nowMs;
  }).length;

  return {
    at: new Date(nowMs).toISOString(),
    queueLength: queued.length,
    runningCount,
    activeLeaseCount: runningCount,
    retryCount: state.retries,
    failureRate,
    avgDurationMs,
    p95DurationMs: percentile(durations, 95),
    p99DurationMs: percentile(durations, 99),
    p95ScheduleDelayMs: percentile(delays, 95),
    p99ScheduleDelayMs: percentile(delays, 99),
    recoverySuccessRate,
    duplicateRate,
    failuresByClass: { ...state.failuresByClass },
    scheduler: {
      lastTickAt: state.lastSchedulerTickAt
        ? new Date(state.lastSchedulerTickAt).toISOString()
        : null,
      lastOk: state.lastSchedulerOk,
      stale:
        state.lastSchedulerTickAt == null ||
        nowMs - state.lastSchedulerTickAt > SCHEDULER_STALE_MS,
      tickCount: state.tickCount,
    },
    worker: {
      lastActivityAt: state.lastWorkerActivityAt
        ? new Date(state.lastWorkerActivityAt).toISOString()
        : null,
      stale:
        state.lastWorkerActivityAt == null ||
        nowMs - state.lastWorkerActivityAt > WORKER_STALE_MS,
    },
    dueAutomationCount,
  };
}

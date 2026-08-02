import type { SchedulerAliveState, SchedulerExecutionRecord } from "./types";

const MAX_HISTORY = 2_000;

type SchedulerScope = typeof globalThis & {
  __atlasSchedulerHistory?: SchedulerExecutionRecord[];
  __atlasSchedulerAlive?: SchedulerAliveState;
  __atlasSchedulerQueueDepthSamples?: number[];
  __atlasSchedulerStartedKeys?: Set<string>;
};

function scope(): SchedulerScope {
  return globalThis as SchedulerScope;
}

function history(): SchedulerExecutionRecord[] {
  const s = scope();
  if (!s.__atlasSchedulerHistory) s.__atlasSchedulerHistory = [];
  return s.__atlasSchedulerHistory;
}

function aliveState(): SchedulerAliveState {
  const s = scope();
  if (!s.__atlasSchedulerAlive) {
    s.__atlasSchedulerAlive = {
      alive: false,
      lastTickAt: null,
      lastTickOk: null,
      lastTickError: null,
      consecutiveFailures: 0,
      tickCount: 0,
      stopped: true,
    };
  }
  return s.__atlasSchedulerAlive;
}

export function appendSchedulerExecution(
  record: SchedulerExecutionRecord,
): SchedulerExecutionRecord {
  const rows = history();
  const idx = rows.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    rows[idx] = record;
  } else {
    rows.unshift(record);
    if (rows.length > MAX_HISTORY) {
      rows.length = MAX_HISTORY;
    }
  }
  return record;
}

export function listSchedulerHistory(limit = 100): SchedulerExecutionRecord[] {
  return history().slice(0, Math.max(0, limit));
}

export function findSchedulerExecution(input: {
  jobId?: string | null;
  runId?: string | null;
  scheduleId?: string | null;
}): SchedulerExecutionRecord | null {
  for (const row of history()) {
    if (input.jobId && row.jobId === input.jobId) return row;
    if (input.runId && row.runId === input.runId) return row;
    if (input.scheduleId && row.scheduleId === input.scheduleId) return row;
  }
  return null;
}

function startedKeys(): Set<string> {
  const s = scope();
  if (!s.__atlasSchedulerStartedKeys) {
    s.__atlasSchedulerStartedKeys = new Set();
  }
  return s.__atlasSchedulerStartedKeys;
}

/** Mark that Scheduler actually started work for this job/run/schedule. */
export function markSchedulerJobStarted(input: {
  jobId?: string | null;
  runId?: string | null;
  scheduleId?: string | null;
}): void {
  const keys = startedKeys();
  if (input.jobId) keys.add(`job:${input.jobId}`);
  if (input.runId) keys.add(`run:${input.runId}`);
  if (input.scheduleId) keys.add(`schedule:${input.scheduleId}`);
}

export function hasSchedulerStartEvidence(input: {
  jobId?: string | null;
  runId?: string | null;
  scheduleId?: string | null;
}): boolean {
  const keys = startedKeys();
  if (input.jobId && keys.has(`job:${input.jobId}`)) return true;
  if (input.runId && keys.has(`run:${input.runId}`)) return true;
  if (input.scheduleId && keys.has(`schedule:${input.scheduleId}`)) return true;
  const found = findSchedulerExecution(input);
  return Boolean(found?.startedAt);
}

export function getSchedulerAliveState(): SchedulerAliveState {
  return { ...aliveState() };
}

export function markSchedulerTickStarted(at = new Date().toISOString()): void {
  const state = aliveState();
  state.lastTickAt = at;
  state.alive = true;
  state.stopped = false;
  // Provisional success until finishSchedulerTick overrides — enables Fail Closed
  // checks during in-flight scheduled jobs in the same tick.
  state.lastTickOk = true;
  state.lastTickError = null;
  if (state.tickCount === 0) state.tickCount = 1;
}

export function markSchedulerTickOutcome(input: {
  ok: boolean;
  error?: string | null;
  at?: string;
}): SchedulerAliveState {
  const state = aliveState();
  const at = input.at ?? new Date().toISOString();
  state.lastTickAt = at;
  state.lastTickOk = input.ok;
  state.lastTickError = input.ok ? null : (input.error ?? "tick failed");
  state.tickCount += 1;
  if (input.ok) {
    state.consecutiveFailures = 0;
    state.alive = true;
    state.stopped = false;
  } else {
    state.consecutiveFailures += 1;
    state.alive = false;
    // Two consecutive tick failures → treat as stopped (Fail Closed).
    state.stopped = state.consecutiveFailures >= 2;
  }
  return { ...state };
}

export function markSchedulerStopped(reason = "scheduler_stopped"): void {
  const state = aliveState();
  state.alive = false;
  state.stopped = true;
  state.lastTickOk = false;
  state.lastTickError = reason;
}

export function recordQueueDepthSample(depth: number): void {
  const s = scope();
  if (!s.__atlasSchedulerQueueDepthSamples) {
    s.__atlasSchedulerQueueDepthSamples = [];
  }
  s.__atlasSchedulerQueueDepthSamples.unshift(Math.max(0, depth));
  if (s.__atlasSchedulerQueueDepthSamples.length > 60) {
    s.__atlasSchedulerQueueDepthSamples.length = 60;
  }
}

export function listQueueDepthSamples(): number[] {
  return [...(scope().__atlasSchedulerQueueDepthSamples ?? [])];
}

export function resetSchedulerStoreForTests(): void {
  const s = scope();
  s.__atlasSchedulerHistory = [];
  s.__atlasSchedulerAlive = {
    alive: false,
    lastTickAt: null,
    lastTickOk: null,
    lastTickError: null,
    consecutiveFailures: 0,
    tickCount: 0,
    stopped: true,
  };
  s.__atlasSchedulerQueueDepthSamples = [];
  s.__atlasSchedulerStartedKeys = new Set();
}

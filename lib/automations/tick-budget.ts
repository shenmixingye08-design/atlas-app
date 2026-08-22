/**
 * Deadline-aware budget for `/api/automations/tick`.
 *
 * Vercel hard-kills the HTTP request at 300s. This module never extends that
 * ceiling. One tick must finish well before it, then leftover work continues
 * on the next tick / `/api/worker/drain` via durable leases.
 */

import { randomUUID } from "crypto";

import { safeLog } from "@/lib/security/redact";

/** Vercel / route hard ceiling. Do not raise this as a "fix". */
export const VERCEL_HARD_TIMEOUT_MS = 300_000;

/**
 * Soft deadline: stop starting new work. Default 45s so a single AI/X/WP
 * call (≤20–60s) cannot push the HTTP request into the 300s kill.
 * Ops may raise via ATLAS_AUTOMATION_TICK_SOFT_DEADLINE_MS up to 240s.
 */
export const DEFAULT_TICK_SOFT_DEADLINE_MS = 45_000;

/** Hard abort of the tick AbortSignal after soft + buffer. */
export const DEFAULT_TICK_HARD_ABORT_BUFFER_MS = 15_000;

/** Never allow a configured soft deadline to approach the 300s kill. */
export const TICK_MAX_SOFT_DEADLINE_MS = 240_000;

/** Do not start another job/stage unless at least this much remains. */
export const TICK_MIN_REMAINING_TO_START_MS = 12_000;

/** In-request bounds — leftover jobs stay leased/queued for the next tick. */
export const TICK_IN_REQUEST_LIMITS = {
  v2ScheduleEnqueue: 20,
  v2ConditionEvaluate: 20,
  v2Dispatch: 2,
  v1ScheduleEnqueue: 40,
  v1WorkerClaim: 2,
  v1WorkerFanOut: 1,
  xScheduledPosts: 3,
  xAutoPostUsers: 2,
  notificationRetries: 5,
} as const;

export type TickStageName =
  | "tick_total"
  | "schema_probe"
  | "automation_discovery"
  | "job_claim"
  | "job_execution"
  | "ai_generation"
  | "deliverable_generation"
  | "deliverable_persistence"
  | "x_scheduled_posting"
  | "wordpress_posting"
  | "external_integrations"
  | "notification"
  | "web_push"
  | "clerk_metadata"
  | "supabase_query"
  | "retry_backoff"
  | "cleanup"
  | "v2_schedule_enqueue"
  | "v2_condition_evaluate"
  | "v2_dispatch"
  | "v1_work_queue"
  | "x_auto_posts"
  | "daily_reports"
  | "notification_retry"
  | "external_monitor";

export type TickStageRecord = {
  stage: TickStageName;
  durationMs: number;
  jobId: string | null;
  automationId: string | null;
  success: boolean;
  failure: boolean;
  timeout: boolean;
  abort: boolean;
};

export type AutomationTickSummary = {
  tickId: string;
  totalDurationMs: number;
  discoveredJobs: number;
  claimedJobs: number;
  completedJobs: number;
  failedJobs: number;
  deferredJobs: number;
  externalCalls: number;
  slowestStage: string | null;
  slowestStageDurationMs: number;
  deadlineReached: boolean;
  schemaErrors: string[];
};

export type TickBudget = {
  tickId: string;
  startedAtMs: number;
  softDeadlineAtMs: number;
  hardAbortAtMs: number;
  softDeadlineMs: number;
  signal: AbortSignal;
  remainingMs: () => number;
  pastSoftDeadline: () => boolean;
  shouldStartMoreWork: () => boolean;
  markDeadlineReached: () => void;
  deadlineReached: () => boolean;
  dispose: () => void;
};

export function resolveTickSoftDeadlineMs(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.ATLAS_AUTOMATION_TICK_SOFT_DEADLINE_MS?.trim();
  if (!raw) return DEFAULT_TICK_SOFT_DEADLINE_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TICK_SOFT_DEADLINE_MS;
  return Math.min(
    TICK_MAX_SOFT_DEADLINE_MS,
    Math.max(5_000, parsed),
  );
}

export function createTickBudget(nowMs = Date.now()): TickBudget {
  const tickId = `tick_${randomUUID()}`;
  const softDeadlineMs = resolveTickSoftDeadlineMs();
  const hardAbortMs = Math.min(
    softDeadlineMs + DEFAULT_TICK_HARD_ABORT_BUFFER_MS,
    TICK_MAX_SOFT_DEADLINE_MS + DEFAULT_TICK_HARD_ABORT_BUFFER_MS,
  );
  const controller = new AbortController();
  const hardTimer = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort();
  }, hardAbortMs);
  hardTimer.unref?.();

  let deadlineReached = false;
  const startedAtMs = nowMs;
  const softDeadlineAtMs = startedAtMs + softDeadlineMs;
  const hardAbortAtMs = startedAtMs + hardAbortMs;

  const remainingMs = () => Math.max(0, softDeadlineAtMs - Date.now());
  const pastSoftDeadline = () => Date.now() >= softDeadlineAtMs;
  const shouldStartMoreWork = () => {
    if (controller.signal.aborted) return false;
    if (pastSoftDeadline()) {
      deadlineReached = true;
      return false;
    }
    return remainingMs() >= TICK_MIN_REMAINING_TO_START_MS;
  };

  return {
    tickId,
    startedAtMs,
    softDeadlineAtMs,
    hardAbortAtMs,
    softDeadlineMs,
    signal: controller.signal,
    remainingMs,
    pastSoftDeadline,
    shouldStartMoreWork,
    markDeadlineReached: () => {
      deadlineReached = true;
    },
    deadlineReached: () => deadlineReached || pastSoftDeadline() || controller.signal.aborted,
    dispose: () => clearTimeout(hardTimer),
  };
}

export function logTickStage(input: {
  tickId: string;
  stage: TickStageName;
  durationMs: number;
  jobId?: string | null;
  automationId?: string | null;
  success: boolean;
  timeout?: boolean;
  abort?: boolean;
}): TickStageRecord {
  const record: TickStageRecord = {
    stage: input.stage,
    durationMs: input.durationMs,
    jobId: input.jobId ?? null,
    automationId: input.automationId ?? null,
    success: input.success,
    failure: !input.success,
    timeout: Boolean(input.timeout),
    abort: Boolean(input.abort),
  };
  safeLog("info", "[automation tick] stage", {
    tickId: input.tickId,
    stage: record.stage,
    durationMs: record.durationMs,
    jobId: record.jobId,
    automationId: record.automationId,
    success: record.success,
    failure: record.failure,
    timeout: record.timeout,
    abort: record.abort,
  });
  return record;
}

export async function runTickStage<T>(input: {
  budget: TickBudget;
  stage: TickStageName;
  jobId?: string | null;
  automationId?: string | null;
  skipIfDeadline?: boolean;
  run: () => Promise<T>;
}): Promise<{
  value: T | null;
  deferred: boolean;
  record: TickStageRecord;
}> {
  if (input.skipIfDeadline !== false && !input.budget.shouldStartMoreWork()) {
    input.budget.markDeadlineReached();
    const record = logTickStage({
      tickId: input.budget.tickId,
      stage: input.stage,
      durationMs: 0,
      jobId: input.jobId,
      automationId: input.automationId,
      success: true,
      abort: true,
    });
    return { value: null, deferred: true, record };
  }

  const started = Date.now();
  try {
    const value = await input.run();
    const record = logTickStage({
      tickId: input.budget.tickId,
      stage: input.stage,
      durationMs: Date.now() - started,
      jobId: input.jobId,
      automationId: input.automationId,
      success: true,
      abort: input.budget.signal.aborted,
    });
    return { value, deferred: false, record };
  } catch (error) {
    const timeout =
      error instanceof Error &&
      /timed?\s*out|timeout|abort/i.test(error.message);
    logTickStage({
      tickId: input.budget.tickId,
      stage: input.stage,
      durationMs: Date.now() - started,
      jobId: input.jobId,
      automationId: input.automationId,
      success: false,
      timeout,
      abort: input.budget.signal.aborted,
    });
    throw error;
  }
}

export function buildAutomationTickSummary(input: {
  tickId: string;
  startedAtMs: number;
  stages: TickStageRecord[];
  discoveredJobs: number;
  claimedJobs: number;
  completedJobs: number;
  failedJobs: number;
  deferredJobs: number;
  externalCalls: number;
  deadlineReached: boolean;
  schemaErrors: string[];
}): AutomationTickSummary {
  let slowestStage: string | null = null;
  let slowestStageDurationMs = 0;
  for (const stage of input.stages) {
    if (stage.durationMs > slowestStageDurationMs) {
      slowestStage = stage.stage;
      slowestStageDurationMs = stage.durationMs;
    }
  }
  return {
    tickId: input.tickId,
    totalDurationMs: Date.now() - input.startedAtMs,
    discoveredJobs: input.discoveredJobs,
    claimedJobs: input.claimedJobs,
    completedJobs: input.completedJobs,
    failedJobs: input.failedJobs,
    deferredJobs: input.deferredJobs,
    externalCalls: input.externalCalls,
    slowestStage,
    slowestStageDurationMs,
    deadlineReached: input.deadlineReached,
    schemaErrors: input.schemaErrors,
  };
}

export function logAutomationTickSummary(summary: AutomationTickSummary): void {
  safeLog("info", "AUTOMATION_TICK_SUMMARY", summary);
}

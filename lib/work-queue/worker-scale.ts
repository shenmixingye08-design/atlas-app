/**
 * P2-03 worker水平スケール — fan-out drain + claim-limit review + backpressure.
 * Problem #20: Hobby daily cron + batch 10 + single curl → linear backlog.
 * Fix: minute path (existing) + horizontal worker split + adaptive claim + backpressure.
 */

import { randomUUID } from "node:crypto";

import {
  WORK_QUEUE_BACKLOG_FANOUT_THRESHOLD,
  WORK_QUEUE_BACKPRESSURE_IN_FLIGHT,
  WORK_QUEUE_CLAIM_LIMIT_MAX,
  WORK_QUEUE_WORKER_BATCH,
  WORK_QUEUE_WORKER_FANOUT_DEFAULT,
  WORK_QUEUE_WORKER_FANOUT_MAX,
} from "./constants";
import { getWorkQueueStore } from "./store";
import { drainWorkQueue, recoverStuckJobs, type WorkerDrainResult } from "./worker";

export type WorkerScalePlan = {
  fanOut: number;
  claimLimit: number;
  backpressure: boolean;
  queued: number;
  inFlight: number;
  reason: string;
};

export type HorizontalDrainResult = {
  plan: WorkerScalePlan;
  recovered: number;
  workers: WorkerDrainResult[];
  leased: number;
  completed: number;
  failed: number;
  retried: number;
  /** Distinct worker ids that participated (proves horizontal split). */
  workerIds: string[];
  /** Flattened completed jobs (compat with single-drain callers). */
  completedJobs: WorkerDrainResult["completedJobs"];
  failedJobs: WorkerDrainResult["failedJobs"];
};

/**
 * Pure planner: claim limit + fan-out from queue depth / in-flight pressure.
 * No AI. Deterministic for multi-instance agreement on the same metrics snapshot.
 */
export function computeWorkerScalePlan(input: {
  queued: number;
  running?: number;
  leased?: number;
  fanOutOverride?: number;
  claimLimitOverride?: number;
}): WorkerScalePlan {
  const queued = Math.max(0, Math.floor(input.queued));
  const running = Math.max(0, Math.floor(input.running ?? 0));
  const leased = Math.max(0, Math.floor(input.leased ?? 0));
  const inFlight = running + leased;

  let fanOut = WORK_QUEUE_WORKER_FANOUT_DEFAULT;
  let claimLimit = WORK_QUEUE_WORKER_BATCH;
  let backpressure = false;
  const reasons: string[] = ["base"];

  if (queued >= WORK_QUEUE_BACKLOG_FANOUT_THRESHOLD) {
    const extra = Math.floor(queued / WORK_QUEUE_BACKLOG_FANOUT_THRESHOLD);
    fanOut = Math.min(
      WORK_QUEUE_WORKER_FANOUT_MAX,
      WORK_QUEUE_WORKER_FANOUT_DEFAULT + extra,
    );
    claimLimit = Math.min(
      WORK_QUEUE_CLAIM_LIMIT_MAX,
      WORK_QUEUE_WORKER_BATCH + Math.floor(queued / 10),
    );
    reasons.push("backlog_scale_up");
  }

  if (inFlight >= WORK_QUEUE_BACKPRESSURE_IN_FLIGHT) {
    backpressure = true;
    fanOut = Math.max(2, fanOut - 1);
    claimLimit = Math.max(5, Math.floor(claimLimit / 2));
    reasons.push("in_flight_backpressure");
  }

  if (
    typeof input.fanOutOverride === "number" &&
    Number.isFinite(input.fanOutOverride)
  ) {
    const raw = Math.floor(input.fanOutOverride);
    fanOut =
      raw <= 0
        ? 0
        : Math.min(WORK_QUEUE_WORKER_FANOUT_MAX, Math.max(1, raw));
    reasons.push("fanout_override");
  }
  if (
    typeof input.claimLimitOverride === "number" &&
    Number.isFinite(input.claimLimitOverride)
  ) {
    const raw = Math.floor(input.claimLimitOverride);
    // 0 = explicit no-drain (tests / schedule-only ticks).
    claimLimit =
      raw <= 0
        ? 0
        : Math.min(WORK_QUEUE_CLAIM_LIMIT_MAX, Math.max(1, raw));
    reasons.push("claim_override");
  }

  return {
    fanOut,
    claimLimit,
    backpressure,
    queued,
    inFlight,
    reason: reasons.join("+"),
  };
}

/**
 * Horizontal drain: recover once, then N concurrent workers with distinct ids.
 * SKIP LOCKED in the store guarantees at-most-once claim across workers.
 */
export async function drainWorkQueueHorizontal(options?: {
  workerIdPrefix?: string;
  fanOut?: number;
  claimLimit?: number;
  leaseMs?: number;
  signal?: AbortSignal;
  canStartJob?: () => boolean;
  /** When true, skip metrics read and use overrides / defaults only. */
  skipMetrics?: boolean;
}): Promise<HorizontalDrainResult> {
  const store = getWorkQueueStore();
  let queued = 0;
  let running = 0;
  let leased = 0;
  if (!options?.skipMetrics) {
    const metrics = await store.metrics();
    queued = metrics.queued;
    running = metrics.running;
    leased = metrics.leased;
  }
  const plan = computeWorkerScalePlan({
    queued,
    running,
    leased,
    fanOutOverride: options?.fanOut,
    claimLimitOverride: options?.claimLimit,
  });

  if (plan.fanOut <= 0 || plan.claimLimit <= 0) {
    return {
      plan,
      recovered: 0,
      workers: [],
      leased: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      workerIds: [],
      completedJobs: [],
      failedJobs: [],
    };
  }

  const recovered = await recoverStuckJobs();
  const prefix =
    options?.workerIdPrefix?.trim() ||
    `hw_${randomUUID().replace(/-/g, "").slice(0, 8)}`;

  const workers = await Promise.all(
    Array.from({ length: plan.fanOut }, (_, i) =>
      drainWorkQueue({
        workerId: `${prefix}_${i}`,
        limit: plan.claimLimit,
        leaseMs: options?.leaseMs,
        signal: options?.signal,
        canStartJob: options?.canStartJob,
        skipRecover: true,
      }),
    ),
  );

  return {
    plan,
    recovered,
    workers,
    leased: workers.reduce((n, w) => n + w.leased, 0),
    completed: workers.reduce((n, w) => n + w.completed, 0),
    failed: workers.reduce((n, w) => n + w.failed, 0),
    retried: workers.reduce((n, w) => n + w.retried, 0),
    workerIds: workers.map((w) => w.workerId),
    completedJobs: workers.flatMap((w) => w.completedJobs),
    failedJobs: workers.flatMap((w) => w.failedJobs),
  };
}

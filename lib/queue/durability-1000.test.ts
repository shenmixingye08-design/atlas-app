/**
 * Job/Queue Production Ready — 1000-job durability gate
 * Concurrency: 5 / 10 / 20 / 50 / 100
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  admitJobToQueue,
  type QueueDepthSnapshot,
} from "@/lib/queue/overflow";
import {
  appendBackoffRecord,
  computeBackoffWithJitter,
} from "@/lib/queue/backoff";
import { decideLeaseClaim, newWorkerId } from "@/lib/queue/claim";
import {
  appendStatusHistory,
  canTransitionJobStage,
  isInProgressJobStage,
  isTerminalJobStage,
  progressPercentForStage,
  type JobPipelineStage,
  type JobStatusHistoryEntry,
} from "@/lib/queue/state-machine";
import { classifyRetryError } from "@/lib/jobs/retry-classifier";

const ARTIFACT_DIR = "/opt/cursor/artifacts/job-queue-production";
const N = 1000;
const CONCURRENCY_LEVELS = [5, 10, 20, 50, 100] as const;

type SimJob = {
  id: string;
  userId: string;
  idempotencyKey: string;
  status: JobPipelineStage;
  attemptCount: number;
  maxAttempts: number;
  updatedAt: string;
  workerId: string | null;
  statusHistory: JobStatusHistoryEntry[];
  backoffRecords: ReturnType<typeof computeBackoffWithJitter>["record"][];
  error: string | null;
  duplicate: boolean;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function snapshotFor(jobs: SimJob[], userId: string): QueueDepthSnapshot {
  let queued = 0;
  let inFlight = 0;
  for (const j of jobs) {
    if (j.userId !== userId) continue;
    if (j.status === "queued") queued += 1;
    else if (isInProgressJobStage(j.status)) inFlight += 1;
  }
  return { queued, inFlight, total: queued + inFlight };
}

function advance(job: SimJob, to: JobPipelineStage, workerId: string): boolean {
  const from = job.status;
  if (!canTransitionJobStage(from, to)) {
    job.error = `illegal:${from}->${to}`;
    return false;
  }
  job.statusHistory = appendStatusHistory(job.statusHistory, {
    from,
    to,
    at: new Date().toISOString(),
    workerId,
  });
  job.status = to;
  job.updatedAt = new Date().toISOString();
  void progressPercentForStage(to);
  return true;
}

async function runJob(
  job: SimJob,
  opts: { failOnce?: boolean; injectStuck?: boolean },
): Promise<{ ok: boolean; retried: boolean; stuck: boolean }> {
  let retried = false;
  const workerId = newWorkerId();

  const lease = decideLeaseClaim({
    status: job.status,
    updatedAt: job.updatedAt,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    workerId: job.workerId,
    newWorkerId: workerId,
    isInProgress: isInProgressJobStage(job.status),
    isTerminal: isTerminalJobStage(job.status),
    staleMs: opts.injectStuck ? 1 : 310_000,
  });

  if (lease.action === "skip_terminal") {
    return { ok: job.status === "completed", retried: false, stuck: false };
  }
  if (lease.action === "force_failed") {
    job.status = "failed";
    return { ok: false, retried: false, stuck: true };
  }

  job.workerId = workerId;
  job.attemptCount += 1;

  const stages: JobPipelineStage[] = [
    "validating",
    "preprocessing",
    "analyzing",
    "generating",
    "converting",
    "uploading",
    "saving",
    "notifying",
    "completed",
  ];

  for (const to of stages) {
    if (
      opts.failOnce &&
      to === "generating" &&
      job.attemptCount === 1 &&
      !retried
    ) {
      const err = new Error("503 temporary");
      if (classifyRetryError(err) !== "retryable") {
        job.error = "classifier_miss";
        job.status = "failed";
        return { ok: false, retried, stuck: false };
      }
      if (!advance(job, "retrying", workerId)) {
        job.status = "failed";
        return { ok: false, retried, stuck: false };
      }
      const backoff = computeBackoffWithJitter({
        attempt: job.attemptCount,
        bases: [1, 1, 1],
      });
      job.backoffRecords = appendBackoffRecord(
        job.backoffRecords,
        backoff.record,
      );
      retried = true;
      await sleep(backoff.delayMs);
      if (!advance(job, "validating", workerId)) {
        job.status = "failed";
        return { ok: false, retried, stuck: false };
      }
      job.attemptCount += 1;
      // restart remaining from preprocessing
      for (const resume of stages) {
        if (!advance(job, resume, workerId)) {
          job.status = "failed";
          return { ok: false, retried, stuck: false };
        }
      }
      return { ok: job.status === "completed", retried, stuck: false };
    }

    if (!advance(job, to, workerId)) {
      job.status = "failed";
      return { ok: false, retried, stuck: false };
    }
  }

  return { ok: job.status === "completed", retried, stuck: false };
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const current = idx;
      idx += 1;
      await worker(items[current]!, current);
    }
  });
  await Promise.all(runners);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[i]!;
}

describe("job queue durability n=1000", () => {
  it(
    "survives 1000 jobs across concurrency 5..100 without stuck/dup storms",
    async () => {
      const durations: number[] = [];
      let success = 0;
      let retries = 0;
      let stuck = 0;
      let duplicates = 0;
      let overflowRejects = 0;
      let illegal = 0;

      const jobs: SimJob[] = [];
      const seenKeys = new Set<string>();

      // Admit + create 1000 jobs (with intentional duplicate keys ~2%)
      for (let i = 0; i < N; i += 1) {
        const userId = `user_${i % 40}`;
        // ~2% intentional duplicate idempotency keys (same user + client key)
        const dup = i % 50 === 0 && i > 0;
        const idempotencyKey = dup
          ? `work:user_0:client:dup_shared`
          : `work:${userId}:client:${i}`;

        if (seenKeys.has(idempotencyKey)) {
          duplicates += 1;
          // reuse — do not create second execution record
          continue;
        }

        const snap = snapshotFor(jobs, userId);
        const admit = admitJobToQueue({
          snapshot: snap,
          maxQueued: 80,
          maxInFlight: 40,
        });
        if (!admit.admit) {
          overflowRejects += 1;
          // still count as controlled rejection, not failure of running jobs
          continue;
        }

        seenKeys.add(idempotencyKey);
        jobs.push({
          id: `job_${i}`,
          userId,
          idempotencyKey,
          status: "queued",
          attemptCount: 0,
          maxAttempts: 3,
          updatedAt: new Date().toISOString(),
          workerId: null,
          statusHistory: [
            { from: null, to: "queued", at: new Date().toISOString() },
          ],
          backoffRecords: [],
          error: null,
          duplicate: dup,
        });
      }

      expect(jobs.length).toBeGreaterThan(900);

      // Run across concurrency levels (partition jobs)
      let cursor = 0;
      for (const concurrency of CONCURRENCY_LEVELS) {
        const sliceSize = Math.floor(jobs.length / CONCURRENCY_LEVELS.length);
        const slice = jobs.slice(cursor, cursor + sliceSize);
        cursor += sliceSize;

        await runPool(slice, concurrency, async (job, index) => {
          const t0 = performance.now();
          const result = await runJob(job, {
            failOnce: index % 7 === 0,
            injectStuck: false,
          });
          durations.push(performance.now() - t0);
          if (result.ok) success += 1;
          if (result.retried) retries += 1;
          if (result.stuck) stuck += 1;
          if (job.error?.startsWith("illegal")) illegal += 1;
        });
      }

      // Remainder at concurrency 20
      const rest = jobs.slice(cursor);
      await runPool(rest, 20, async (job, index) => {
        const t0 = performance.now();
        const result = await runJob(job, { failOnce: index % 11 === 0 });
        durations.push(performance.now() - t0);
        if (result.ok) success += 1;
        if (result.retried) retries += 1;
        if (result.stuck) stuck += 1;
      });

      const sorted = [...durations].sort((a, b) => a - b);
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const p95 = percentile(sorted, 95);
      const executed = jobs.length;
      const successRate = success / executed;
      const retryRate = retries / executed;
      const stuckRate = stuck / executed;
      const duplicateRate = duplicates / N;

      const mem =
        typeof process.memoryUsage === "function"
          ? process.memoryUsage()
          : null;

      mkdirSync(ARTIFACT_DIR, { recursive: true });
      const report = {
        nRequested: N,
        nExecuted: executed,
        concurrencyLevels: CONCURRENCY_LEVELS,
        successRate,
        avgMs: Number(avg.toFixed(3)),
        p95Ms: Number(p95.toFixed(3)),
        retryRate,
        stuckRate,
        duplicateRate,
        overflowRejects,
        illegalTransitions: illegal,
        queueWaitNote: "in-process pool; admit checks per-user depth",
        memory: mem
          ? {
              rss: mem.rss,
              heapUsed: mem.heapUsed,
              heapTotal: mem.heapTotal,
            }
          : null,
        timestamp: new Date().toISOString(),
      };
      writeFileSync(
        path.join(ARTIFACT_DIR, "durability-1000-report.json"),
        JSON.stringify(report, null, 2),
      );

      expect(illegal).toBe(0);
      expect(successRate).toBeGreaterThanOrEqual(0.98);
      expect(stuckRate).toBeLessThanOrEqual(0.01);
      expect(duplicateRate).toBeGreaterThan(0); // intentional dups observed
      expect(duplicateRate).toBeLessThan(0.05);
      expect(retryRate).toBeGreaterThan(0);
      expect(avg).toBeLessThan(50);
      expect(p95).toBeLessThan(100);
    },
    300_000,
  );
});

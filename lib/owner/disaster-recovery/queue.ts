import { randomUUID } from "crypto";

import {
  getDrQueueJob,
  incrementDrRetryCount,
  listDrQueueJobs,
  prependDrRecoveryEvent,
  saveDrQueueJob,
} from "./store";
import type { DrQueueJob, DrQueueJobKind, DrTargetId } from "./types";

/** Mirrors Commander retry budget (COMMANDER_MAX_RETRIES + 1). */
export const DR_MAX_ATTEMPTS = 3;

function backoffMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}

export function enqueueDisasterJob(input: {
  kind: DrQueueJobKind;
  targetId: DrTargetId;
  message: string;
  userId?: string | null;
  source?: string | null;
}): DrQueueJob {
  const now = new Date().toISOString();
  const job: DrQueueJob = {
    id: `drq_${randomUUID()}`,
    kind: input.kind,
    targetId: input.targetId,
    message: input.message.slice(0, 500),
    userId: input.userId ?? null,
    source: input.source ?? null,
    attempts: 0,
    maxAttempts: DR_MAX_ATTEMPTS,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    nextAttemptAt: now,
    lastError: null,
  };
  saveDrQueueJob(job);
  prependDrRecoveryEvent({
    id: `dre_${randomUUID()}`,
    at: now,
    action: "enqueue",
    targetId: input.targetId,
    message: `Queue: ${input.kind} — ${input.message}`.slice(0, 400),
    jobId: job.id,
  });
  void import("./durable").then((m) => m.schedulePersistDisasterRecovery());
  return job;
}

/**
 * Process due queue jobs with retry/backoff.
 * Jobs are "simulated" recovery probes — success clears the job;
 * exhaustion moves to dead + signals fallback.
 */
export function processDisasterQueue(options?: {
  now?: Date;
  /** Test hook: force success/failure for a kind */
  probe?: (job: DrQueueJob) => boolean;
}): {
  processed: number;
  succeeded: number;
  failed: number;
  dead: number;
} {
  const now = options?.now ?? new Date();
  const nowIso = now.toISOString();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let dead = 0;

  const due = listDrQueueJobs().filter(
    (job) =>
      (job.status === "queued" || job.status === "retrying") &&
      new Date(job.nextAttemptAt).getTime() <= now.getTime(),
  );

  for (const job of due.slice(0, 20)) {
    processed += 1;
    incrementDrRetryCount();
    const attempts = job.attempts + 1;
    const ok = options?.probe
      ? options.probe(job)
      : // Default probe: after at least one retry, treat as recovered (ATLAS stays up).
        attempts >= 2;

    if (ok) {
      saveDrQueueJob({
        ...job,
        attempts,
        status: "succeeded",
        updatedAt: nowIso,
        lastError: null,
      });
      prependDrRecoveryEvent({
        id: `dre_${randomUUID()}`,
        at: nowIso,
        action: "retry_success",
        targetId: job.targetId,
        message: `Retry succeeded (${attempts}/${job.maxAttempts})`,
        jobId: job.id,
      });
      succeeded += 1;
      continue;
    }

    if (attempts >= job.maxAttempts) {
      saveDrQueueJob({
        ...job,
        attempts,
        status: "dead",
        updatedAt: nowIso,
        lastError: job.message,
      });
      prependDrRecoveryEvent({
        id: `dre_${randomUUID()}`,
        at: nowIso,
        action: "retry_failed",
        targetId: job.targetId,
        message: `Retries exhausted → fallback`,
        jobId: job.id,
      });
      dead += 1;
      failed += 1;
      continue;
    }

    const next = new Date(now.getTime() + backoffMs(attempts)).toISOString();
    saveDrQueueJob({
      ...job,
      attempts,
      status: "retrying",
      updatedAt: nowIso,
      nextAttemptAt: next,
      lastError: job.message,
    });
    prependDrRecoveryEvent({
      id: `dre_${randomUUID()}`,
      at: nowIso,
      action: "retry",
      targetId: job.targetId,
      message: `Retry scheduled (${attempts}/${job.maxAttempts})`,
      jobId: job.id,
    });
    failed += 1;
  }

  void import("./durable").then((m) => m.schedulePersistDisasterRecovery());
  return { processed, succeeded, failed, dead };
}

export function markJobFallback(jobId: string): DrQueueJob | null {
  const job = getDrQueueJob(jobId);
  if (!job) return null;
  const now = new Date().toISOString();
  return saveDrQueueJob({
    ...job,
    status: "fallback",
    updatedAt: now,
  });
}

export function countDrQueue(): {
  queued: number;
  retrying: number;
  dead: number;
  succeeded: number;
  fallback: number;
} {
  const jobs = listDrQueueJobs();
  return {
    queued: jobs.filter((j) => j.status === "queued").length,
    retrying: jobs.filter((j) => j.status === "retrying").length,
    dead: jobs.filter((j) => j.status === "dead").length,
    succeeded: jobs.filter((j) => j.status === "succeeded").length,
    fallback: jobs.filter((j) => j.status === "fallback").length,
  };
}

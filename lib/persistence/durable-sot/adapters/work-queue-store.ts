/**
 * WorkQueueStore adapter backed by Durable SoT repositories (DB only).
 * process-memory / file SoT is not used when this adapter is selected.
 *
 * Storage swap only — no worker/scheduler/retry business-logic changes.
 */

import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { WORK_QUEUE_DEFAULT_MAX_ATTEMPTS } from "@/lib/work-queue/constants";
import {
  buildJobIdempotencyKey,
  buildStepIdempotencyKey,
} from "@/lib/work-queue/occurrence";
import type { WorkQueueStore } from "@/lib/work-queue/store/interface";
import type {
  EnqueueJobInput,
  WorkJobRecord,
  WorkJobStatus,
  WorkQueueMetrics,
  WorkStepRecord,
  WorkStepStatus,
} from "@/lib/work-queue/types";
import {
  createDurableSotPool,
  resolveDurableSotDatabaseUrl,
} from "../db";
import type {
  DurableJobPersistedStatus,
  DurableJobRecord,
  DurableQueueStatus,
  DurableStepRecord,
  DurableStepStatus,
} from "../types";
import { DurableSotUniqueViolationError } from "../types";
import { DurableJobsRepository } from "../repositories/jobs-repository";
import { DurableOccurrencesRepository } from "../repositories/occurrences-repository";
import { DurableQueueRepository } from "../repositories/queue-repository";
import { DurableStepsRepository } from "../repositories/steps-repository";
import { RunRepository } from "../repositories/run-repository";
import {
  createRunJobQueueTransaction,
  withDurableTransaction,
} from "../transactions/create-run-job-queue";

function toWorkStatus(status: DurableJobPersistedStatus): WorkJobStatus {
  if (status === "retry") return "retry_scheduled";
  return status as WorkJobStatus;
}

function toDurableStatus(status: WorkJobStatus): DurableJobPersistedStatus {
  if (status === "retry_scheduled") return "retry";
  return status as DurableJobPersistedStatus;
}

function toWorkStepStatus(status: DurableStepStatus): WorkStepStatus {
  if (status === "succeeded") return "completed";
  return status as WorkStepStatus;
}

function toDurableStepStatus(status: WorkStepStatus): DurableStepStatus {
  if (status === "completed") return "succeeded";
  return status as DurableStepStatus;
}

function stepToWork(step: DurableStepRecord, jobId: string): WorkStepRecord {
  const artifactIds = Array.isArray(step.outputBindings.__artifactIds)
    ? (step.outputBindings.__artifactIds as string[])
    : [];
  const outputBindings = { ...step.outputBindings };
  const idem = outputBindings.__idempotencyKey;
  delete outputBindings.__artifactIds;
  delete outputBindings.__idempotencyKey;
  return {
    stepId: step.stepId,
    jobId,
    stepIndex: step.stepIndex,
    stepType: step.stepType as WorkStepRecord["stepType"],
    status: toWorkStepStatus(step.status),
    attempt: step.attempt,
    inputBindings: step.inputBindings,
    outputBindings,
    artifactIds,
    errorCode: step.errorCode,
    errorMessage: step.errorMessage,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    idempotencyKey:
      typeof idem === "string"
        ? idem
        : buildStepIdempotencyKey(jobId, step.stepId),
    createdAt: step.createdAt,
    updatedAt: step.updatedAt,
  };
}

function jobToWork(
  job: DurableJobRecord,
  steps: WorkStepRecord[],
): WorkJobRecord {
  return {
    jobId: job.jobId,
    runId: job.runId,
    automationId: job.automationId,
    ownerId: job.ownerId,
    occurrenceKey: job.occurrenceKey,
    scheduleId: job.scheduleId,
    status: toWorkStatus(job.status),
    priority: job.priority,
    availableAt: job.availableAt,
    scheduledAt: job.scheduledAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    leaseOwner: job.leaseOwner,
    leaseExpiresAt: job.leaseExpiresAt,
    heartbeatAt: job.heartbeatAt,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    retryAt: job.retryAt,
    errorCode: job.errorCode,
    failedStage: job.failedStage,
    diagnosticId: job.diagnosticId,
    idempotencyKey: job.idempotencyKey,
    payload:
      (job.payload as WorkJobRecord["payload"]) ?? { kind: "automation" },
    resultSummary: job.resultSummary,
    firstError: job.firstError,
    lastError: job.lastError ?? job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    steps,
  };
}

export class DurableSotWorkQueueStore implements WorkQueueStore {
  readonly kind = "postgres" as const;

  private readonly pool: Pool;
  private readonly jobs: DurableJobsRepository;
  private readonly queue: DurableQueueRepository;
  private readonly runs: RunRepository;
  private readonly steps: DurableStepsRepository;

  private metaDelays: number[] = [];
  private metaExec: number[] = [];
  private metaRecoverySuccess = 0;
  private metaRecoveryTotal = 0;
  private metaDuplicates = 0;
  private schedulerLastSuccessAt: string | null = null;

  constructor(connectionString?: string) {
    const url =
      connectionString ??
      (process.env.DURABLE_SOT_DATABASE_URL?.trim() ||
        resolveDurableSotDatabaseUrl());
    if (!url) {
      throw new Error("DurableSotWorkQueueStore requires a Postgres URL");
    }
    this.pool = createDurableSotPool(url);
    this.jobs = new DurableJobsRepository(this.pool);
    this.queue = new DurableQueueRepository(this.pool);
    this.runs = new RunRepository(this.pool);
    this.steps = new DurableStepsRepository(this.pool);
  }

  private async loadSteps(
    jobId: string,
    runId: string,
  ): Promise<WorkStepRecord[]> {
    const byJob = await this.steps.listByJobId(jobId);
    const rows = byJob.length > 0 ? byJob : await this.steps.list(runId);
    return rows.map((s) => stepToWork(s, jobId));
  }

  async enqueue(
    input: EnqueueJobInput,
  ): Promise<{ job: WorkJobRecord; created: boolean }> {
    const idem =
      input.idempotencyKey ?? buildJobIdempotencyKey(input.occurrenceKey);

    const existing =
      (await this.jobs.getByIdempotencyKey(idem)) ??
      (await this.jobs.getByAutomationOccurrence(
        input.automationId,
        input.occurrenceKey,
      ));
    if (existing) {
      this.metaDuplicates += 1;
      const steps = await this.loadSteps(existing.jobId, existing.runId);
      return { job: jobToWork(existing, steps), created: false };
    }

    const jobId = randomUUID();
    const runId = randomUUID();
    const now = new Date().toISOString();

    try {
      const created = await withDurableTransaction(this.pool, async (client) => {
        const runs = new RunRepository(client);
        const jobs = new DurableJobsRepository(client);
        const queue = new DurableQueueRepository(client);
        const stepsRepo = new DurableStepsRepository(client);
        const occurrences = new DurableOccurrencesRepository(client);

        let occurrenceId: string | null = null;
        if (input.automationId) {
          // Create occurrence first without run_id (FK), then link via run.
          const occurrence = await occurrences.create({
            ownerId: input.ownerId,
            automationId: input.automationId,
            occurrenceKey: input.occurrenceKey,
            scheduleId: input.scheduleId ?? null,
            scheduledAt: input.scheduledAt ?? now,
            status: "enqueued",
          });
          occurrenceId = occurrence.occurrenceId;
        }

        const run = await runs.createRun({
          runId,
          ownerId: input.ownerId,
          automationId: input.automationId,
          occurrenceId,
          status: "queued",
          triggerType: input.payload.triggerType ?? "automation",
          payload: {
            workQueue: true,
            ...input.payload,
          },
          idempotencyKey: `run:${idem}`,
        });

        const job = await jobs.create({
          jobId,
          runId: run.runId,
          ownerId: input.ownerId,
          automationId: input.automationId,
          occurrenceId,
          occurrenceKey: input.occurrenceKey,
          scheduleId: input.scheduleId ?? null,
          status: "queued",
          priority: input.priority ?? 0,
          availableAt: now,
          scheduledAt: input.scheduledAt ?? null,
          maxAttempts: input.maxAttempts ?? WORK_QUEUE_DEFAULT_MAX_ATTEMPTS,
          idempotencyKey: idem,
          payload: input.payload as unknown as Record<string, unknown>,
        });

        await runs.updateRun(run.runId, { jobId: job.jobId });
        await queue.enqueue(job);

        const workSteps: WorkStepRecord[] = [];
        for (let i = 0; i < input.steps.length; i += 1) {
          const step = input.steps[i]!;
          const stepIdem = buildStepIdempotencyKey(job.jobId, step.stepId);
          const createdStep = await stepsRepo.create({
            runId: run.runId,
            stepId: step.stepId,
            jobId: job.jobId,
            stepIndex: i,
            stepType: step.stepType,
            status: "pending",
            inputBindings: step.inputBindings ?? {},
            outputBindings: { __idempotencyKey: stepIdem, __artifactIds: [] },
          });
          workSteps.push(stepToWork(createdStep, job.jobId));
        }

        return { job, steps: workSteps };
      });

      return { job: jobToWork(created.job, created.steps), created: true };
    } catch (error) {
      if (error instanceof DurableSotUniqueViolationError) {
        this.metaDuplicates += 1;
        const again =
          (await this.jobs.getByIdempotencyKey(idem)) ??
          (await this.jobs.getByAutomationOccurrence(
            input.automationId,
            input.occurrenceKey,
          ));
        if (again) {
          const steps = await this.loadSteps(again.jobId, again.runId);
          return { job: jobToWork(again, steps), created: false };
        }
      }
      throw error;
    }
  }

  async leaseJobs(input: {
    workerId: string;
    limit: number;
    leaseMs: number;
    nowMs?: number;
  }): Promise<WorkJobRecord[]> {
    const nowMs = input.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const leaseExpires = new Date(nowMs + input.leaseMs).toISOString();
    const claimed = await this.queue.claimDue({
      nowIso,
      leaseOwner: input.workerId,
      leaseExpiresAt: leaseExpires,
      limit: input.limit,
    });
    const jobs: WorkJobRecord[] = [];
    for (const row of claimed) {
      const steps = await this.loadSteps(row.jobId, row.runId);
      jobs.push(jobToWork(row, steps));
    }
    return jobs;
  }

  async heartbeat(
    jobId: string,
    workerId: string,
    leaseMs: number,
  ): Promise<boolean> {
    const now = Date.now();
    return this.queue.heartbeat({
      jobId,
      leaseOwner: workerId,
      heartbeatAt: new Date(now).toISOString(),
      leaseExpiresAt: new Date(now + leaseMs).toISOString(),
    });
  }

  async getJob(jobId: string): Promise<WorkJobRecord | null> {
    const job = await this.jobs.get(jobId);
    if (!job) return null;
    const steps = await this.loadSteps(job.jobId, job.runId);
    return jobToWork(job, steps);
  }

  async updateJob(
    jobId: string,
    patch: Partial<WorkJobRecord> & { status?: WorkJobStatus },
    expectedLeaseOwner?: string,
  ): Promise<WorkJobRecord | null> {
    const current = await this.jobs.get(jobId);
    if (!current) return null;
    if (
      expectedLeaseOwner &&
      current.leaseOwner &&
      current.leaseOwner !== expectedLeaseOwner
    ) {
      return null;
    }

    const updated = await this.queue.update(jobId, {
      status: patch.status ? toDurableStatus(patch.status) : undefined,
      availableAt: patch.availableAt,
      startedAt: patch.startedAt,
      completedAt: patch.completedAt,
      leaseOwner: patch.leaseOwner,
      leaseExpiresAt: patch.leaseExpiresAt,
      heartbeatAt: patch.heartbeatAt,
      attempt: patch.attempt,
      retryAt: patch.retryAt,
      errorCode: patch.errorCode,
      errorMessage: patch.lastError ?? undefined,
      diagnosticId: patch.diagnosticId,
      failedStage: patch.failedStage,
      firstError: patch.firstError,
      lastError: patch.lastError,
      resultSummary: patch.resultSummary,
      payload: patch.payload as unknown as Record<string, unknown> | undefined,
    });
    if (!updated) return null;

    if (patch.status === "completed" || patch.status === "partially_completed") {
      await this.runs.completeRun(updated.runId, {
        status: "succeeded",
        resultSummary: patch.resultSummary ?? null,
      });
    } else if (patch.status === "failed" || patch.status === "dead_letter") {
      await this.runs.completeRun(updated.runId, {
        status: patch.status === "dead_letter" ? "dead_letter" : "failed",
        errorCode: patch.errorCode ?? null,
        errorMessage: patch.lastError ?? null,
      });
    } else if (patch.status === "cancelled") {
      await this.runs.completeRun(updated.runId, { status: "cancelled" });
    } else if (patch.status === "running" || patch.status === "leased") {
      await this.runs.updateRun(updated.runId, {
        status: patch.status,
        startedAt: patch.startedAt ?? new Date().toISOString(),
      });
    } else if (patch.status === "retry_scheduled") {
      await this.runs.updateRun(updated.runId, { status: "retry_scheduled" });
    }

    const steps = await this.loadSteps(updated.jobId, updated.runId);
    return jobToWork(updated, steps);
  }

  async updateStep(step: WorkStepRecord): Promise<WorkStepRecord> {
    const job = await this.jobs.get(step.jobId);
    if (!job) throw new Error(`step_not_found:${step.jobId}:${step.stepId}`);
    const updated = await this.steps.update(job.runId, step.stepId, {
      status: toDurableStepStatus(step.status),
      attempt: step.attempt,
      inputBindings: step.inputBindings,
      outputBindings: {
        ...step.outputBindings,
        __artifactIds: step.artifactIds,
        __idempotencyKey: step.idempotencyKey,
      },
      errorCode: step.errorCode,
      errorMessage: step.errorMessage,
      startedAt: step.startedAt,
      completedAt: step.completedAt,
      jobId: step.jobId,
    });
    if (!updated) {
      throw new Error(`step_not_found:${step.jobId}:${step.stepId}`);
    }
    return stepToWork(updated, step.jobId);
  }

  async listStuck(nowMs: number, stuckMs: number): Promise<WorkJobRecord[]> {
    const cutoff = new Date(nowMs - stuckMs).toISOString();
    const rows = await this.queue.listStuck(cutoff, 100);
    const jobs: WorkJobRecord[] = [];
    for (const row of rows) {
      const steps = await this.loadSteps(row.jobId, row.runId);
      jobs.push(jobToWork(row, steps));
    }
    return jobs;
  }

  async listByStatus(
    status: WorkJobStatus,
    limit = 100,
  ): Promise<WorkJobRecord[]> {
    const durableStatus = toDurableStatus(status);
    let combined: DurableJobRecord[] = [];
    if (durableStatus === "retry" || status === "retry_scheduled") {
      const retryRows = await this.jobs.listByStatus("retry", limit);
      const scheduled = await this.jobs.listByStatus("retry_scheduled", limit);
      const seen = new Set<string>();
      for (const row of [...retryRows, ...scheduled]) {
        if (seen.has(row.jobId)) continue;
        seen.add(row.jobId);
        combined.push(row);
      }
      combined = combined.slice(0, limit);
    } else {
      combined = await this.queue.listByStatus(
        durableStatus as DurableQueueStatus,
        limit,
      );
    }
    const jobs: WorkJobRecord[] = [];
    for (const row of combined) {
      const steps = await this.loadSteps(row.jobId, row.runId);
      jobs.push(jobToWork(row, steps));
    }
    return jobs;
  }

  async metrics(nowMs = Date.now()): Promise<WorkQueueMetrics> {
    const counts = await this.queue.statusCounts();
    const map = new Map<string, { c: number; oldest: number | null }>();
    for (const row of counts) {
      const status = row.status === "retry" ? "retry_scheduled" : row.status;
      const prev = map.get(status);
      map.set(status, {
        c: row.count + (prev?.c ?? 0),
        oldest:
          row.oldestAgeMs == null
            ? (prev?.oldest ?? null)
            : Math.max(row.oldestAgeMs, prev?.oldest ?? 0),
      });
    }
    const stuck = await this.queue.countStuck(
      new Date(nowMs - 90_000).toISOString(),
    );
    const delays = [...this.metaDelays].sort((a, b) => a - b);
    const execs = [...this.metaExec].sort((a, b) => a - b);
    const p = (arr: number[], pct: number) => {
      if (!arr.length) return null;
      return arr[
        Math.min(arr.length - 1, Math.ceil((pct / 100) * arr.length) - 1)
      ]!;
    };
    const queued = map.get("queued")?.c ?? 0;
    const completed = map.get("completed")?.c ?? 0;
    const failed = map.get("failed")?.c ?? 0;
    const deadLetter = map.get("dead_letter")?.c ?? 0;
    const terminal = completed + failed + deadLetter;
    const cronEnabled =
      process.env.ENABLE_SCHEDULED_CRON?.trim().toLowerCase() !== "false";
    let alive = cronEnabled;
    if (this.schedulerLastSuccessAt) {
      const age = nowMs - new Date(this.schedulerLastSuccessAt).getTime();
      alive = cronEnabled && Number.isFinite(age) && age <= 26 * 60 * 60 * 1000;
    }
    const running = map.get("running")?.c ?? 0;
    const leased = map.get("leased")?.c ?? 0;
    const workerBusyDenom = Math.max(1, leased + running);
    return {
      queued,
      waiting: queued,
      leased,
      running,
      retryScheduled: map.get("retry_scheduled")?.c ?? 0,
      stuck,
      failed,
      deadLetter,
      completed,
      oldestQueuedAgeMs: map.get("queued")?.oldest ?? null,
      duplicateCount: this.metaDuplicates,
      schedulerLastSuccessAt: this.schedulerLastSuccessAt,
      p95ScheduleDelayMs: p(delays, 95),
      p99ScheduleDelayMs: p(delays, 99),
      averageDelayMs:
        delays.length === 0
          ? null
          : delays.reduce((a, b) => a + b, 0) / delays.length,
      p95ExecutionMs: p(execs, 95),
      recoverySuccessRate:
        this.metaRecoveryTotal > 0
          ? this.metaRecoverySuccess / this.metaRecoveryTotal
          : null,
      alive,
      workerCount: leased + running > 0 ? 1 : 0,
      successRate: terminal > 0 ? completed / terminal : null,
      failureRate: terminal > 0 ? (failed + deadLetter) / terminal : null,
      averageQueueWaitMs: map.get("queued")?.oldest ?? null,
      workerBusyPercent: Math.round(
        ((leased + running) / workerBusyDenom) * 100,
      ),
    };
  }

  async recordSchedulerSuccess(atIso: string): Promise<void> {
    this.schedulerLastSuccessAt = atIso;
  }

  async recordScheduleDelay(delayMs: number): Promise<void> {
    this.metaDelays.push(delayMs);
    if (this.metaDelays.length > 5000) {
      this.metaDelays = this.metaDelays.slice(-2000);
    }
  }

  async recordExecutionMs(durationMs: number): Promise<void> {
    this.metaExec.push(durationMs);
    if (this.metaExec.length > 5000) this.metaExec = this.metaExec.slice(-2000);
  }

  async recordRecovery(success: boolean): Promise<void> {
    this.metaRecoveryTotal += 1;
    if (success) this.metaRecoverySuccess += 1;
  }

  async resetForTests(): Promise<void> {
    await this.queue.resetAll();
    this.metaDelays = [];
    this.metaExec = [];
    this.metaRecoverySuccess = 0;
    this.metaRecoveryTotal = 0;
    this.metaDuplicates = 0;
    this.schedulerLastSuccessAt = null;
  }

  getRunRepository(): RunRepository {
    return this.runs;
  }

  getQueueRepository(): DurableQueueRepository {
    return this.queue;
  }

  getJobsRepository(): DurableJobsRepository {
    return this.jobs;
  }

  createRunJobQueue(
    input: Parameters<typeof createRunJobQueueTransaction>[1],
  ) {
    return createRunJobQueueTransaction(this.pool, input);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function tryCreateDurableSotWorkQueueStore(): DurableSotWorkQueueStore | null {
  const url =
    process.env.DURABLE_SOT_DATABASE_URL?.trim() ||
    resolveDurableSotDatabaseUrl();
  if (!url) return null;
  if (process.env.ATLAS_DURABLE_SOT_QUEUE?.trim().toLowerCase() === "false") {
    return null;
  }
  return new DurableSotWorkQueueStore(url);
}

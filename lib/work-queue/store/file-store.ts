import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import {
  WORK_QUEUE_DEFAULT_MAX_ATTEMPTS,
  WORK_QUEUE_FILE_ENV,
  WORK_QUEUE_MEMORY_FAST_ENV,
} from "../constants";
import {
  buildJobIdempotencyKey,
  buildStepIdempotencyKey,
} from "../occurrence";
import type {
  WorkCompletionEvidenceRecord,
  WorkExecutionOutcome,
  WorkExecutionRecord,
  WorkLockRecord,
  WorkMetricCounterKey,
  WorkRecoveryEventRecord,
  WorkRecoveryKind,
  WorkWorkerRecord,
} from "../durability-types";
import type {
  EnqueueJobInput,
  WorkJobRecord,
  WorkJobStatus,
  WorkQueueMetrics,
  WorkRetryHistoryEntry,
  WorkSideEffectRecord,
  WorkStepRecord,
} from "../types";
import { WORK_JOB_TERMINAL_STATUSES, WORK_JOB_TRANSITIONS } from "../types";
import type { WorkQueueStore } from "./interface";

type FileSnapshot = {
  jobs: WorkJobRecord[];
  sideEffects: WorkSideEffectRecord[];
  schedulerLastSuccessAt: string | null;
  scheduleDelays: number[];
  executionMs: number[];
  recoverySuccess: number;
  recoveryTotal: number;
  duplicateCount: number;
  retryCount: number;
  timeoutCount: number;
  notificationCount: number;
  startedCount: number;
  completedCount: number;
  failedCount: number;
  workers: WorkWorkerRecord[];
  executions: WorkExecutionRecord[];
  completionEvidence: WorkCompletionEvidenceRecord[];
  recoveryEvents: WorkRecoveryEventRecord[];
  locks: WorkLockRecord[];
  /** Durable key/value meta (scheduler gate, etc.) — not process memory. */
  meta: Record<string, unknown>;
};

function emptySnapshot(): FileSnapshot {
  return {
    jobs: [],
    sideEffects: [],
    schedulerLastSuccessAt: null,
    scheduleDelays: [],
    executionMs: [],
    recoverySuccess: 0,
    recoveryTotal: 0,
    duplicateCount: 0,
    retryCount: 0,
    timeoutCount: 0,
    notificationCount: 0,
    startedCount: 0,
    completedCount: 0,
    failedCount: 0,
    workers: [],
    executions: [],
    completionEvidence: [],
    recoveryEvents: [],
    locks: [],
    meta: {},
  };
}

function normalizeJob(job: WorkJobRecord): WorkJobRecord {
  return {
    ...job,
    retryHistory: Array.isArray(job.retryHistory) ? job.retryHistory : [],
  };
}

function defaultPath(): string {
  return (
    process.env[WORK_QUEUE_FILE_ENV]?.trim() ||
    `${process.cwd()}/.data/work-queue.json`
  );
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx] ?? null;
}

function canTransition(from: WorkJobStatus, to: WorkJobStatus): boolean {
  if (from === to) return true;
  return WORK_JOB_TRANSITIONS[from].includes(to);
}

export class FileWorkQueueStore implements WorkQueueStore {
  readonly kind = "file" as const;
  private readonly path: string;
  private data: FileSnapshot;
  private mutex: Promise<void> = Promise.resolve();

  constructor(path = defaultPath()) {
    this.path = path;
    this.data = this.load();
  }

  private load(): FileSnapshot {
    try {
      if (!existsSync(this.path)) {
        return emptySnapshot();
      }
      const raw = JSON.parse(readFileSync(this.path, "utf8")) as Partial<FileSnapshot>;
      const base = emptySnapshot();
      return {
        ...base,
        jobs: Array.isArray(raw.jobs) ? raw.jobs.map(normalizeJob) : [],
        sideEffects: Array.isArray(raw.sideEffects) ? raw.sideEffects : [],
        schedulerLastSuccessAt: raw.schedulerLastSuccessAt ?? null,
        scheduleDelays: Array.isArray(raw.scheduleDelays) ? raw.scheduleDelays : [],
        executionMs: Array.isArray(raw.executionMs) ? raw.executionMs : [],
        recoverySuccess: raw.recoverySuccess ?? 0,
        recoveryTotal: raw.recoveryTotal ?? 0,
        duplicateCount: raw.duplicateCount ?? 0,
        retryCount: raw.retryCount ?? 0,
        timeoutCount: raw.timeoutCount ?? 0,
        notificationCount: raw.notificationCount ?? 0,
        startedCount: raw.startedCount ?? 0,
        completedCount: raw.completedCount ?? 0,
        failedCount: raw.failedCount ?? 0,
        workers: Array.isArray(raw.workers)
          ? raw.workers.map((w) => ({
              workerId: w.workerId,
              lastSeenAt: w.lastSeenAt,
              startedAt: w.startedAt ?? w.lastSeenAt,
              busy: Boolean(w.busy),
              leaseCount: Number(w.leaseCount ?? 0),
              status: w.status ?? "active",
            }))
          : [],
        executions: Array.isArray(raw.executions) ? raw.executions : [],
        completionEvidence: Array.isArray(raw.completionEvidence)
          ? raw.completionEvidence
          : [],
        recoveryEvents: Array.isArray(raw.recoveryEvents)
          ? raw.recoveryEvents
          : [],
        locks: Array.isArray(raw.locks) ? raw.locks : [],
        meta:
          raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta)
            ? (raw.meta as Record<string, unknown>)
            : {},
      };
    } catch {
      return emptySnapshot();
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data), "utf8");
    renameSync(tmp, this.path);
  }

  private async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const prev = this.mutex;
    let release!: () => void;
    this.mutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      // Single-writer test mode skips reload (mutex already serializes).
      // Multi-process / restart paths still reload from disk.
      if (process.env.ATLAS_WORK_QUEUE_FORCE_FILE !== "true") {
        this.data = this.load();
      }
      return await fn();
    } finally {
      // Load tests: avoid O(n²) JSON rewrite on every mutation.
      if (process.env[WORK_QUEUE_MEMORY_FAST_ENV] !== "true") {
        this.persist();
      }
      release();
    }
  }

  private buildJob(
    input: EnqueueJobInput,
  ): { job: WorkJobRecord; created: boolean } {
    const idem =
      input.idempotencyKey ?? buildJobIdempotencyKey(input.occurrenceKey);
    const existing = this.data.jobs.find(
      (j) =>
        j.idempotencyKey === idem ||
        (j.automationId === input.automationId &&
          j.occurrenceKey === input.occurrenceKey),
    );
    if (existing) {
      this.data.duplicateCount += 1;
      return { job: existing, created: false };
    }

    const now = new Date().toISOString();
    const jobId = randomUUID();
    const runId = `run_${jobId.replace(/-/g, "").slice(0, 16)}`;
    const steps: WorkStepRecord[] = input.steps.map((step, index) => ({
      stepId: step.stepId,
      jobId,
      stepIndex: index,
      stepType: step.stepType,
      status: "pending",
      attempt: 0,
      inputBindings: step.inputBindings ?? {},
      outputBindings: {},
      artifactIds: [],
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      idempotencyKey: buildStepIdempotencyKey(jobId, step.stepId),
      createdAt: now,
      updatedAt: now,
    }));

    const job: WorkJobRecord = {
      jobId,
      runId,
      automationId: input.automationId,
      ownerId: input.ownerId,
      occurrenceKey: input.occurrenceKey,
      scheduleId: input.scheduleId ?? null,
      status: "queued",
      priority: input.priority ?? 0,
      availableAt: now,
      scheduledAt: input.scheduledAt ?? null,
      startedAt: null,
      completedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      attempt: 0,
      maxAttempts: input.maxAttempts ?? WORK_QUEUE_DEFAULT_MAX_ATTEMPTS,
      retryAt: null,
      errorCode: null,
      failedStage: null,
      diagnosticId: null,
      idempotencyKey: idem,
      payload: input.payload,
      resultSummary: null,
      firstError: null,
      lastError: null,
      retryHistory: [],
      createdAt: now,
      updatedAt: now,
      steps,
    };
    this.data.jobs.push(job);
    return { job, created: true };
  }

  async enqueue(
    input: EnqueueJobInput,
  ): Promise<{ job: WorkJobRecord; created: boolean }> {
    return this.withLock(() => this.buildJob(input));
  }

  async enqueueMany(
    inputs: EnqueueJobInput[],
  ): Promise<Array<{ job: WorkJobRecord; created: boolean }>> {
    return this.withLock(() => inputs.map((input) => this.buildJob(input)));
  }

  async leaseJobs(input: {
    workerId: string;
    limit: number;
    leaseMs: number;
    nowMs?: number;
  }): Promise<WorkJobRecord[]> {
    return this.withLock(() => {
      const nowMs = input.nowMs ?? Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const leaseExpires = new Date(nowMs + input.leaseMs).toISOString();
      const candidates = this.data.jobs
        .filter((job) => {
          if (job.status === "queued" || job.status === "retry_scheduled") {
            return new Date(job.availableAt).getTime() <= nowMs;
          }
          if (
            (job.status === "leased" || job.status === "running") &&
            job.leaseExpiresAt &&
            new Date(job.leaseExpiresAt).getTime() < nowMs
          ) {
            return true; // expired lease reclaim
          }
          return false;
        })
        .sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          return (
            new Date(a.availableAt).getTime() - new Date(b.availableAt).getTime()
          );
        })
        .slice(0, input.limit);

      const leased: WorkJobRecord[] = [];
      for (const job of candidates) {
        if (
          WORK_JOB_TERMINAL_STATUSES.includes(job.status) ||
          job.status === "failed"
        ) {
          continue;
        }
        job.status = "leased";
        job.leaseOwner = input.workerId;
        job.leaseExpiresAt = leaseExpires;
        job.heartbeatAt = nowIso;
        job.updatedAt = nowIso;
        if (!job.startedAt) job.startedAt = nowIso;
        leased.push(structuredClone(job));
      }
      this.touchWorkerInternal(input.workerId, nowIso, {
        busy: leased.length > 0,
        leaseDelta: leased.length,
      });
      return leased;
    });
  }

  async heartbeat(
    jobId: string,
    workerId: string,
    leaseMs: number,
  ): Promise<boolean> {
    return this.withLock(() => {
      const job = this.data.jobs.find((j) => j.jobId === jobId);
      if (!job) return false;
      if (job.leaseOwner !== workerId) return false;
      if (job.status !== "leased" && job.status !== "running") return false;
      const now = Date.now();
      job.heartbeatAt = new Date(now).toISOString();
      job.leaseExpiresAt = new Date(now + leaseMs).toISOString();
      job.updatedAt = job.heartbeatAt;
      this.touchWorkerInternal(workerId, job.heartbeatAt, { busy: true });
      return true;
    });
  }

  private touchWorkerInternal(
    workerId: string,
    at: string,
    opts?: { busy?: boolean; leaseDelta?: number },
  ): WorkWorkerRecord {
    const existing = this.data.workers.find((w) => w.workerId === workerId);
    if (existing) {
      existing.lastSeenAt = at;
      existing.busy = opts?.busy ?? existing.busy;
      existing.leaseCount += opts?.leaseDelta ?? 0;
      existing.status = "active";
      return existing;
    }
    const created: WorkWorkerRecord = {
      workerId,
      lastSeenAt: at,
      startedAt: at,
      busy: opts?.busy ?? false,
      leaseCount: opts?.leaseDelta ?? 0,
      status: "active",
    };
    this.data.workers.push(created);
    if (this.data.workers.length > 200) {
      this.data.workers = this.data.workers.slice(-100);
    }
    return created;
  }

  async getJob(jobId: string): Promise<WorkJobRecord | null> {
    return this.withLock(() => {
      const job = this.data.jobs.find((j) => j.jobId === jobId);
      return job ? structuredClone(job) : null;
    });
  }

  async updateJob(
    jobId: string,
    patch: Partial<WorkJobRecord> & { status?: WorkJobStatus },
    expectedLeaseOwner?: string,
  ): Promise<WorkJobRecord | null> {
    return this.withLock(() => {
      const job = this.data.jobs.find((j) => j.jobId === jobId);
      if (!job) return null;
      if (expectedLeaseOwner && job.leaseOwner !== expectedLeaseOwner) {
        return null;
      }
      if (patch.status && !canTransition(job.status, patch.status)) {
        throw new Error(
          `invalid_transition:${job.status}->${patch.status}:${jobId}`,
        );
      }
      Object.assign(job, patch, { updatedAt: new Date().toISOString() });
      if (patch.steps) job.steps = patch.steps;
      return structuredClone(job);
    });
  }

  async updateStep(step: WorkStepRecord): Promise<WorkStepRecord> {
    return this.withLock(() => {
      const job = this.data.jobs.find((j) => j.jobId === step.jobId);
      if (!job) throw new Error(`job_not_found:${step.jobId}`);
      const idx = job.steps.findIndex((s) => s.stepId === step.stepId);
      const next = { ...step, updatedAt: new Date().toISOString() };
      if (idx >= 0) job.steps[idx] = next;
      else job.steps.push(next);
      job.updatedAt = next.updatedAt;
      return structuredClone(next);
    });
  }

  async listStuck(nowMs: number, stuckMs: number): Promise<WorkJobRecord[]> {
    return this.withLock(() => {
      const cutoff = nowMs - stuckMs;
      return this.data.jobs
        .filter((job) => {
          if (job.status !== "leased" && job.status !== "running") return false;
          const hb = job.heartbeatAt
            ? new Date(job.heartbeatAt).getTime()
            : job.startedAt
              ? new Date(job.startedAt).getTime()
              : 0;
          return hb > 0 && hb < cutoff;
        })
        .map((j) => structuredClone(j));
    });
  }

  async listByStatus(
    status: WorkJobStatus,
    limit = 100,
  ): Promise<WorkJobRecord[]> {
    return this.withLock(() =>
      this.data.jobs
        .filter((j) => j.status === status)
        .slice(0, limit)
        .map((j) => structuredClone(j)),
    );
  }

  async metrics(nowMs = Date.now()): Promise<WorkQueueMetrics> {
    return this.withLock(() => {
      const counts = {
        queued: 0,
        leased: 0,
        running: 0,
        retryScheduled: 0,
        stuck: 0,
        failed: 0,
        deadLetter: 0,
        completed: 0,
      };
      let oldest: number | null = null;
      const queueWaits: number[] = [];
      for (const job of this.data.jobs) {
        if (job.status === "queued") {
          counts.queued += 1;
          const age = nowMs - new Date(job.createdAt).getTime();
          oldest = oldest === null ? age : Math.max(oldest, age);
          queueWaits.push(age);
        } else if (job.status === "leased") counts.leased += 1;
        else if (job.status === "running") counts.running += 1;
        else if (job.status === "retry_scheduled") counts.retryScheduled += 1;
        else if (job.status === "failed") counts.failed += 1;
        else if (job.status === "dead_letter") counts.deadLetter += 1;
        else if (job.status === "completed") counts.completed += 1;
      }
      const delays = [...this.data.scheduleDelays].sort((a, b) => a - b);
      const execs = [...this.data.executionMs].sort((a, b) => a - b);
      const recoveryRate =
        this.data.recoveryTotal > 0
          ? this.data.recoverySuccess / this.data.recoveryTotal
          : null;
      const terminal = counts.completed + counts.failed + counts.deadLetter;
      const successRate = terminal > 0 ? counts.completed / terminal : null;
      const failureRate =
        terminal > 0 ? (counts.failed + counts.deadLetter) / terminal : null;
      const avgDelay =
        delays.length === 0
          ? null
          : delays.reduce((a, b) => a + b, 0) / delays.length;
      const avgQueueWait =
        queueWaits.length === 0
          ? null
          : queueWaits.reduce((a, b) => a + b, 0) / queueWaits.length;

      const activeWorkers = this.data.workers.filter((w) => {
        const age = nowMs - new Date(w.lastSeenAt).getTime();
        return Number.isFinite(age) && age <= 120_000;
      });
      const busy = activeWorkers.filter((w) => w.busy).length;

      const cronEnabled =
        process.env.ENABLE_SCHEDULED_CRON?.trim().toLowerCase() !== "false";
      let alive = cronEnabled;
      if (this.data.schedulerLastSuccessAt) {
        const age =
          nowMs - new Date(this.data.schedulerLastSuccessAt).getTime();
        // Hobby daily cron → 26h; minute cron stays well under.
        alive = cronEnabled && Number.isFinite(age) && age <= 26 * 60 * 60 * 1000;
      }

      const avgExec =
        execs.length === 0
          ? null
          : execs.reduce((a, b) => a + b, 0) / execs.length;

      return {
        ...counts,
        waiting: counts.queued,
        stuck: this.data.jobs.filter((j) => {
          if (j.status !== "leased" && j.status !== "running") return false;
          const hb = j.heartbeatAt ? new Date(j.heartbeatAt).getTime() : 0;
          return hb > 0 && nowMs - hb > 90_000;
        }).length,
        oldestQueuedAgeMs: oldest,
        duplicateCount: this.data.duplicateCount,
        schedulerLastSuccessAt: this.data.schedulerLastSuccessAt,
        p95ScheduleDelayMs: percentile(delays, 95),
        p99ScheduleDelayMs: percentile(delays, 99),
        averageDelayMs: avgDelay,
        p95ExecutionMs: percentile(execs, 95),
        averageExecutionMs: avgExec,
        recoverySuccessRate: recoveryRate,
        recoveryCount: this.data.recoveryTotal,
        retryCount: this.data.retryCount,
        timeoutCount: this.data.timeoutCount,
        notificationCount: this.data.notificationCount,
        startedCount: this.data.startedCount,
        queueLength: counts.queued,
        alive,
        workerCount: activeWorkers.length,
        successRate,
        failureRate,
        averageQueueWaitMs: avgQueueWait,
        workerBusyPercent:
          activeWorkers.length === 0
            ? null
            : Math.round((busy / activeWorkers.length) * 100),
      };
    });
  }

  async recordSchedulerSuccess(atIso: string): Promise<void> {
    await this.withLock(() => {
      this.data.schedulerLastSuccessAt = atIso;
    });
  }

  async recordScheduleDelay(delayMs: number): Promise<void> {
    await this.withLock(() => {
      this.data.scheduleDelays.push(delayMs);
      if (this.data.scheduleDelays.length > 5000) {
        this.data.scheduleDelays = this.data.scheduleDelays.slice(-2000);
      }
    });
  }

  async recordExecutionMs(durationMs: number): Promise<void> {
    await this.withLock(() => {
      this.data.executionMs.push(durationMs);
      if (this.data.executionMs.length > 5000) {
        this.data.executionMs = this.data.executionMs.slice(-2000);
      }
    });
  }

  async recordRecovery(success: boolean): Promise<void> {
    await this.withLock(() => {
      this.data.recoveryTotal += 1;
      if (success) this.data.recoverySuccess += 1;
    });
  }

  async touchWorker(
    workerId: string,
    input?: { busy?: boolean; leaseDelta?: number },
  ): Promise<WorkWorkerRecord> {
    return this.withLock(() =>
      structuredClone(
        this.touchWorkerInternal(workerId, new Date().toISOString(), input),
      ),
    );
  }

  async listWorkers(nowMs = Date.now()): Promise<WorkWorkerRecord[]> {
    return this.withLock(() =>
      this.data.workers.map((w) => {
        const age = nowMs - new Date(w.lastSeenAt).getTime();
        const status: WorkWorkerRecord["status"] =
          Number.isFinite(age) && age > 120_000 ? "stale" : w.status;
        return structuredClone({ ...w, status });
      }),
    );
  }

  async beginExecution(input: {
    executionId: string;
    jobId: string;
    runId: string;
    workerId: string;
    attempt: number;
    resumeFromStep: number;
  }): Promise<WorkExecutionRecord> {
    return this.withLock(() => {
      const record: WorkExecutionRecord = {
        executionId: input.executionId,
        jobId: input.jobId,
        runId: input.runId,
        workerId: input.workerId,
        attempt: input.attempt,
        resumeFromStep: input.resumeFromStep,
        startedAt: new Date().toISOString(),
        endedAt: null,
        outcome: null,
        detail: {},
      };
      this.data.executions.push(record);
      this.data.startedCount += 1;
      return structuredClone(record);
    });
  }

  async endExecution(input: {
    executionId: string;
    outcome: WorkExecutionOutcome;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    await this.withLock(() => {
      const row = this.data.executions.find(
        (e) => e.executionId === input.executionId,
      );
      if (!row) return;
      row.endedAt = new Date().toISOString();
      row.outcome = input.outcome;
      row.detail = input.detail ?? {};
      if (input.outcome === "completed") this.data.completedCount += 1;
      if (input.outcome === "failed") this.data.failedCount += 1;
      if (input.outcome === "retried") this.data.retryCount += 1;
    });
  }

  async recordCompletionEvidence(input: {
    evidenceId: string;
    jobId: string;
    runId: string;
    stepId: string;
    kind: string;
    payload: Record<string, unknown>;
  }): Promise<WorkCompletionEvidenceRecord> {
    return this.withLock(() => {
      const existing = this.data.completionEvidence.find(
        (e) =>
          e.jobId === input.jobId &&
          e.stepId === input.stepId &&
          e.kind === input.kind,
      );
      if (existing) return structuredClone(existing);
      const record: WorkCompletionEvidenceRecord = {
        evidenceId: input.evidenceId,
        jobId: input.jobId,
        runId: input.runId,
        stepId: input.stepId,
        kind: input.kind,
        payload: input.payload,
        createdAt: new Date().toISOString(),
      };
      this.data.completionEvidence.push(record);
      if (input.kind.includes("notify")) {
        this.data.notificationCount += 1;
      }
      return structuredClone(record);
    });
  }

  async listCompletionEvidence(
    jobId: string,
  ): Promise<WorkCompletionEvidenceRecord[]> {
    return this.withLock(() =>
      this.data.completionEvidence
        .filter((e) => e.jobId === jobId)
        .map((e) => structuredClone(e)),
    );
  }

  async recordRecoveryEvent(input: {
    eventId: string;
    jobId: string | null;
    kind: WorkRecoveryKind;
    success: boolean;
    detail?: Record<string, unknown>;
  }): Promise<WorkRecoveryEventRecord> {
    return this.withLock(() => {
      const record: WorkRecoveryEventRecord = {
        eventId: input.eventId,
        jobId: input.jobId,
        kind: input.kind,
        success: input.success,
        detail: input.detail ?? {},
        createdAt: new Date().toISOString(),
      };
      this.data.recoveryEvents.push(record);
      if (this.data.recoveryEvents.length > 500) {
        this.data.recoveryEvents = this.data.recoveryEvents.slice(-300);
      }
      if (input.kind === "stuck" || input.kind === "lease_expired") {
        this.data.timeoutCount += 1;
      }
      return structuredClone(record);
    });
  }

  async listRecoveryEvents(limit = 50): Promise<WorkRecoveryEventRecord[]> {
    return this.withLock(() =>
      [...this.data.recoveryEvents]
        .reverse()
        .slice(0, limit)
        .map((e) => structuredClone(e)),
    );
  }

  async incrementMetricCounter(
    key: WorkMetricCounterKey,
    by = 1,
  ): Promise<number> {
    return this.withLock(() => {
      switch (key) {
        case "retry_count":
          this.data.retryCount += by;
          return this.data.retryCount;
        case "recovery_count":
          this.data.recoveryTotal += by;
          return this.data.recoveryTotal;
        case "duplicate_count":
          this.data.duplicateCount += by;
          return this.data.duplicateCount;
        case "timeout_count":
          this.data.timeoutCount += by;
          return this.data.timeoutCount;
        case "notification_count":
          this.data.notificationCount += by;
          return this.data.notificationCount;
        case "job_started_count":
          this.data.startedCount += by;
          return this.data.startedCount;
        case "job_completed_count":
          this.data.completedCount += by;
          return this.data.completedCount;
        case "job_failed_count":
          this.data.failedCount += by;
          return this.data.failedCount;
        default:
          return 0;
      }
    });
  }

  async getMetricCounters(): Promise<Record<WorkMetricCounterKey, number>> {
    return this.withLock(() => ({
      retry_count: this.data.retryCount,
      recovery_count: this.data.recoveryTotal,
      duplicate_count: this.data.duplicateCount,
      timeout_count: this.data.timeoutCount,
      notification_count: this.data.notificationCount,
      job_started_count: this.data.startedCount,
      job_completed_count: this.data.completedCount,
      job_failed_count: this.data.failedCount,
    }));
  }

  async acquireLock(input: {
    lockKey: string;
    owner: string;
    leaseMs: number;
  }): Promise<{ acquired: boolean; lock: WorkLockRecord | null }> {
    return this.withLock(() => {
      const now = Date.now();
      const existing = this.data.locks.find((l) => l.lockKey === input.lockKey);
      if (existing && new Date(existing.expiresAt).getTime() > now) {
        if (existing.owner === input.owner) {
          existing.expiresAt = new Date(now + input.leaseMs).toISOString();
          return { acquired: true, lock: structuredClone(existing) };
        }
        return { acquired: false, lock: structuredClone(existing) };
      }
      const lock: WorkLockRecord = {
        lockKey: input.lockKey,
        owner: input.owner,
        expiresAt: new Date(now + input.leaseMs).toISOString(),
        createdAt: new Date(now).toISOString(),
      };
      this.data.locks = this.data.locks.filter(
        (l) => l.lockKey !== input.lockKey,
      );
      this.data.locks.push(lock);
      return { acquired: true, lock: structuredClone(lock) };
    });
  }

  async releaseLock(lockKey: string, owner: string): Promise<boolean> {
    return this.withLock(() => {
      const before = this.data.locks.length;
      this.data.locks = this.data.locks.filter(
        (l) => !(l.lockKey === lockKey && l.owner === owner),
      );
      return this.data.locks.length < before;
    });
  }

  async listLocks(nowMs = Date.now()): Promise<WorkLockRecord[]> {
    return this.withLock(() =>
      this.data.locks
        .filter((l) => new Date(l.expiresAt).getTime() > nowMs)
        .map((l) => structuredClone(l)),
    );
  }

  async listActiveLeases(limit = 50): Promise<
    Array<{
      jobId: string;
      leaseOwner: string | null;
      leaseExpiresAt: string | null;
      heartbeatAt: string | null;
      status: string;
    }>
  > {
    return this.withLock(() =>
      this.data.jobs
        .filter((j) => j.status === "leased" || j.status === "running")
        .slice(0, limit)
        .map((j) => ({
          jobId: j.jobId,
          leaseOwner: j.leaseOwner,
          leaseExpiresAt: j.leaseExpiresAt,
          heartbeatAt: j.heartbeatAt,
          status: j.status,
        })),
    );
  }

  async listRecentRetries(limit = 50): Promise<
    Array<{
      jobId: string;
      attempt: number;
      reason: string;
      at: string;
    }>
  > {
    return this.withLock(() => {
      const rows: Array<{
        jobId: string;
        attempt: number;
        reason: string;
        at: string;
      }> = [];
      for (const job of this.data.jobs) {
        for (const entry of job.retryHistory ?? []) {
          rows.push({
            jobId: job.jobId,
            attempt: entry.attempt,
            reason: entry.reason,
            at: entry.at,
          });
        }
      }
      return rows
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, limit);
    });
  }

  async getSideEffect(
    idempotencyKey: string,
  ): Promise<WorkSideEffectRecord | null> {
    return this.withLock(() => {
      const found = this.data.sideEffects.find(
        (row) => row.idempotencyKey === idempotencyKey,
      );
      return found ? structuredClone(found) : null;
    });
  }

  async tryRecordSideEffect(input: {
    idempotencyKey: string;
    jobId: string;
    runId: string;
    stepId: string;
    kind: string;
    result: Record<string, unknown>;
  }): Promise<{ created: boolean; record: WorkSideEffectRecord }> {
    return this.withLock(() => {
      const existing = this.data.sideEffects.find(
        (row) => row.idempotencyKey === input.idempotencyKey,
      );
      if (existing) {
        return { created: false, record: structuredClone(existing) };
      }
      const record: WorkSideEffectRecord = {
        idempotencyKey: input.idempotencyKey,
        jobId: input.jobId,
        runId: input.runId,
        stepId: input.stepId,
        kind: input.kind,
        result: input.result,
        createdAt: new Date().toISOString(),
      };
      this.data.sideEffects.push(record);
      if (input.kind.includes("notify")) {
        this.data.notificationCount += 1;
      }
      return { created: true, record: structuredClone(record) };
    });
  }

  async appendRetryHistory(
    jobId: string,
    entry: WorkRetryHistoryEntry,
  ): Promise<void> {
    await this.withLock(() => {
      const job = this.data.jobs.find((j) => j.jobId === jobId);
      if (!job) return;
      if (!Array.isArray(job.retryHistory)) job.retryHistory = [];
      job.retryHistory.push(entry);
      job.updatedAt = new Date().toISOString();
    });
  }

  async readSchedulerMeta<T>(key: string, fallback: T): Promise<T> {
    return this.withLock(() => {
      if (!(key in this.data.meta)) return fallback;
      return this.data.meta[key] as T;
    });
  }

  async writeSchedulerMeta(key: string, value: unknown): Promise<void> {
    await this.withLock(() => {
      this.data.meta[key] = value;
    });
  }

  async resetForTests(): Promise<void> {
    await this.withLock(() => {
      this.data = emptySnapshot();
    });
  }
}

export function createFileWorkQueueStore(path?: string): FileWorkQueueStore {
  return new FileWorkQueueStore(path);
}

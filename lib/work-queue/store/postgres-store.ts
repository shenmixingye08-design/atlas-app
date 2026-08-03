import { randomUUID } from "node:crypto";

import pg from "pg";

import {
  WORK_QUEUE_DEFAULT_MAX_ATTEMPTS,
} from "../constants";
import {
  buildJobIdempotencyKey,
  buildStepIdempotencyKey,
} from "../occurrence";
import type {
  EnqueueJobInput,
  WorkJobRecord,
  WorkJobStatus,
  WorkQueueMetrics,
  WorkRetryHistoryEntry,
  WorkSideEffectRecord,
  WorkStepRecord,
} from "../types";
import { WORK_JOB_TRANSITIONS } from "../types";
import type { WorkQueueStore } from "./interface";

function canTransition(from: WorkJobStatus, to: WorkJobStatus): boolean {
  if (from === to) return true;
  return WORK_JOB_TRANSITIONS[from].includes(to);
}

function resolveDatabaseUrl(): string | null {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DIRECT_URL?.trim() ||
    "";
  return url || null;
}

function rowToJob(row: Record<string, unknown>, steps: WorkStepRecord[]): WorkJobRecord {
  return {
    jobId: String(row.job_id),
    runId: String(row.run_id),
    automationId: (row.automation_id as string | null) ?? null,
    ownerId: String(row.owner_id),
    occurrenceKey: String(row.occurrence_key),
    scheduleId: (row.schedule_id as string | null) ?? null,
    status: row.status as WorkJobStatus,
    priority: Number(row.priority ?? 0),
    availableAt: new Date(String(row.available_at)).toISOString(),
    scheduledAt: row.scheduled_at
      ? new Date(String(row.scheduled_at)).toISOString()
      : null,
    startedAt: row.started_at
      ? new Date(String(row.started_at)).toISOString()
      : null,
    completedAt: row.completed_at
      ? new Date(String(row.completed_at)).toISOString()
      : null,
    leaseOwner: (row.lease_owner as string | null) ?? null,
    leaseExpiresAt: row.lease_expires_at
      ? new Date(String(row.lease_expires_at)).toISOString()
      : null,
    heartbeatAt: row.heartbeat_at
      ? new Date(String(row.heartbeat_at)).toISOString()
      : null,
    attempt: Number(row.attempt ?? 0),
    maxAttempts: Number(row.max_attempts ?? WORK_QUEUE_DEFAULT_MAX_ATTEMPTS),
    retryAt: row.retry_at ? new Date(String(row.retry_at)).toISOString() : null,
    errorCode: (row.error_code as string | null) ?? null,
    failedStage: (row.failed_stage as string | null) ?? null,
    diagnosticId: (row.diagnostic_id as string | null) ?? null,
    idempotencyKey: String(row.idempotency_key),
    payload: (row.payload as WorkJobRecord["payload"]) ?? { kind: "automation" },
    resultSummary: (row.result_summary as string | null) ?? null,
    firstError: (row.first_error as string | null) ?? null,
    lastError: (row.last_error as string | null) ?? null,
    retryHistory: Array.isArray(row.retry_history)
      ? (row.retry_history as WorkRetryHistoryEntry[])
      : [],
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    steps,
  };
}

function rowToStep(row: Record<string, unknown>): WorkStepRecord {
  return {
    stepId: String(row.step_id),
    jobId: String(row.job_id),
    stepIndex: Number(row.step_index),
    stepType: row.step_type as WorkStepRecord["stepType"],
    status: row.status as WorkStepRecord["status"],
    attempt: Number(row.attempt ?? 0),
    inputBindings: (row.input_bindings as Record<string, unknown>) ?? {},
    outputBindings: (row.output_bindings as Record<string, unknown>) ?? {},
    artifactIds: Array.isArray(row.artifact_ids)
      ? (row.artifact_ids as string[])
      : [],
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    startedAt: row.started_at
      ? new Date(String(row.started_at)).toISOString()
      : null,
    completedAt: row.completed_at
      ? new Date(String(row.completed_at)).toISOString()
      : null,
    idempotencyKey: String(row.idempotency_key),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

/**
 * Postgres-backed store using SKIP LOCKED leases.
 * Requires migration 20260802_atlas_work_queue.sql applied.
 */
export class PostgresWorkQueueStore implements WorkQueueStore {
  readonly kind = "postgres" as const;
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 10_000,
    });
  }

  private async readMeta<T>(key: string, fallback: T): Promise<T> {
    try {
      const res = await this.pool.query(
        `select meta_value from public.atlas_work_queue_meta where meta_key = $1`,
        [key],
      );
      if (!res.rowCount) return fallback;
      return res.rows[0]!.meta_value as T;
    } catch {
      return fallback;
    }
  }

  private async writeMeta(key: string, value: unknown): Promise<void> {
    try {
      await this.pool.query(
        `insert into public.atlas_work_queue_meta (meta_key, meta_value, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (meta_key) do update
           set meta_value = excluded.meta_value,
               updated_at = excluded.updated_at`,
        [key, JSON.stringify(value)],
      );
    } catch {
      // Meta table may be missing before migration — do not fail jobs.
    }
  }

  async readSchedulerMeta<T>(key: string, fallback: T): Promise<T> {
    return this.readMeta(key, fallback);
  }

  async writeSchedulerMeta(key: string, value: unknown): Promise<void> {
    await this.writeMeta(key, value);
  }

  private async loadSteps(client: pg.PoolClient | pg.Pool, jobId: string) {
    const res = await client.query(
      `select * from public.atlas_work_queue_steps where job_id = $1 order by step_index asc`,
      [jobId],
    );
    return res.rows.map((row) => rowToStep(row as Record<string, unknown>));
  }

  async enqueue(
    input: EnqueueJobInput,
  ): Promise<{ job: WorkJobRecord; created: boolean }> {
    const idem =
      input.idempotencyKey ?? buildJobIdempotencyKey(input.occurrenceKey);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const existing = await client.query(
        `select * from public.atlas_work_queue_jobs
         where idempotency_key = $1
            or (automation_id is not distinct from $2 and occurrence_key = $3)
         limit 1`,
        [idem, input.automationId, input.occurrenceKey],
      );
      if (existing.rowCount && existing.rows[0]) {
        const prev = await this.readMeta<number>("duplicate_count", 0);
        await this.writeMeta("duplicate_count", prev + 1);
        const jobId = String(existing.rows[0].job_id);
        const steps = await this.loadSteps(client, jobId);
        await client.query("commit");
        return {
          job: rowToJob(existing.rows[0] as Record<string, unknown>, steps),
          created: false,
        };
      }

      const jobId = randomUUID();
      const runId = `run_${jobId.replace(/-/g, "").slice(0, 16)}`;
      const now = new Date().toISOString();
      await client.query(
        `insert into public.atlas_work_queue_jobs (
          job_id, run_id, automation_id, owner_id, occurrence_key, schedule_id,
          status, priority, available_at, scheduled_at, attempt, max_attempts,
          idempotency_key, payload, created_at, updated_at
        ) values (
          $1,$2,$3,$4,$5,$6,'queued',$7,$8,$9,0,$10,$11,$12::jsonb,$13,$13
        )`,
        [
          jobId,
          runId,
          input.automationId,
          input.ownerId,
          input.occurrenceKey,
          input.scheduleId ?? null,
          input.priority ?? 0,
          now,
          input.scheduledAt ?? null,
          input.maxAttempts ?? WORK_QUEUE_DEFAULT_MAX_ATTEMPTS,
          idem,
          JSON.stringify(input.payload),
          now,
        ],
      );

      const steps: WorkStepRecord[] = [];
      for (let i = 0; i < input.steps.length; i += 1) {
        const step = input.steps[i]!;
        const stepIdem = buildStepIdempotencyKey(jobId, step.stepId);
        await client.query(
          `insert into public.atlas_work_queue_steps (
            step_id, job_id, step_index, step_type, status, attempt,
            input_bindings, output_bindings, artifact_ids, idempotency_key,
            created_at, updated_at
          ) values ($1,$2,$3,$4,'pending',0,$5::jsonb,'{}'::jsonb,'[]'::jsonb,$6,$7,$7)`,
          [
            step.stepId,
            jobId,
            i,
            step.stepType,
            JSON.stringify(step.inputBindings ?? {}),
            stepIdem,
            now,
          ],
        );
        steps.push({
          stepId: step.stepId,
          jobId,
          stepIndex: i,
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
          idempotencyKey: stepIdem,
          createdAt: now,
          updatedAt: now,
        });
      }

      const loaded = await client.query(
        `select * from public.atlas_work_queue_jobs where job_id = $1`,
        [jobId],
      );
      await client.query("commit");
      return {
        job: rowToJob(loaded.rows[0] as Record<string, unknown>, steps),
        created: true,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async leaseJobs(input: {
    workerId: string;
    limit: number;
    leaseMs: number;
    nowMs?: number;
  }): Promise<WorkJobRecord[]> {
    const client = await this.pool.connect();
    const nowMs = input.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const leaseExpires = new Date(nowMs + input.leaseMs).toISOString();
    try {
      await client.query("begin");
      const res = await client.query(
        `with cte as (
           select job_id from public.atlas_work_queue_jobs
           where (
             status in ('queued', 'retry_scheduled') and available_at <= $1::timestamptz
           ) or (
             status in ('leased', 'running')
             and lease_expires_at is not null
             and lease_expires_at < $1::timestamptz
           )
           order by priority desc, available_at asc
           for update skip locked
           limit $2
         )
         update public.atlas_work_queue_jobs j
         set status = 'leased',
             lease_owner = $3,
             lease_expires_at = $4::timestamptz,
             heartbeat_at = $1::timestamptz,
             started_at = coalesce(started_at, $1::timestamptz),
             updated_at = $1::timestamptz
         from cte
         where j.job_id = cte.job_id
         returning j.*`,
        [nowIso, input.limit, input.workerId, leaseExpires],
      );
      const jobs: WorkJobRecord[] = [];
      for (const row of res.rows) {
        const steps = await this.loadSteps(client, String(row.job_id));
        jobs.push(rowToJob(row as Record<string, unknown>, steps));
      }
      await client.query("commit");
      return jobs;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async heartbeat(
    jobId: string,
    workerId: string,
    leaseMs: number,
  ): Promise<boolean> {
    const now = Date.now();
    const res = await this.pool.query(
      `update public.atlas_work_queue_jobs
       set heartbeat_at = $1::timestamptz,
           lease_expires_at = $2::timestamptz,
           updated_at = $1::timestamptz
       where job_id = $3
         and lease_owner = $4
         and status in ('leased', 'running')`,
      [
        new Date(now).toISOString(),
        new Date(now + leaseMs).toISOString(),
        jobId,
        workerId,
      ],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async getJob(jobId: string): Promise<WorkJobRecord | null> {
    const res = await this.pool.query(
      `select * from public.atlas_work_queue_jobs where job_id = $1`,
      [jobId],
    );
    if (!res.rowCount) return null;
    const steps = await this.loadSteps(this.pool, jobId);
    return rowToJob(res.rows[0] as Record<string, unknown>, steps);
  }

  async updateJob(
    jobId: string,
    patch: Partial<WorkJobRecord> & { status?: WorkJobStatus },
    expectedLeaseOwner?: string,
  ): Promise<WorkJobRecord | null> {
    if (patch.status !== undefined) {
      const current = await this.getJob(jobId);
      if (!current) return null;
      if (!canTransition(current.status, patch.status)) {
        throw new Error(
          `invalid_transition:${current.status}->${patch.status}:${jobId}`,
        );
      }
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, value: unknown) => {
      values.push(value);
      fields.push(`${col} = $${values.length}`);
    };
    if (patch.status !== undefined) add("status", patch.status);
    if (patch.availableAt !== undefined) add("available_at", patch.availableAt);
    if (patch.startedAt !== undefined) add("started_at", patch.startedAt);
    if (patch.completedAt !== undefined) add("completed_at", patch.completedAt);
    if (patch.leaseOwner !== undefined) add("lease_owner", patch.leaseOwner);
    if (patch.leaseExpiresAt !== undefined) {
      add("lease_expires_at", patch.leaseExpiresAt);
    }
    if (patch.heartbeatAt !== undefined) add("heartbeat_at", patch.heartbeatAt);
    if (patch.attempt !== undefined) add("attempt", patch.attempt);
    if (patch.retryAt !== undefined) add("retry_at", patch.retryAt);
    if (patch.errorCode !== undefined) add("error_code", patch.errorCode);
    if (patch.failedStage !== undefined) add("failed_stage", patch.failedStage);
    if (patch.diagnosticId !== undefined) {
      add("diagnostic_id", patch.diagnosticId);
    }
    if (patch.resultSummary !== undefined) {
      add("result_summary", patch.resultSummary);
    }
    if (patch.firstError !== undefined) add("first_error", patch.firstError);
    if (patch.lastError !== undefined) add("last_error", patch.lastError);
    if (patch.retryHistory !== undefined) {
      add("retry_history", JSON.stringify(patch.retryHistory));
    }
    add("updated_at", new Date().toISOString());

    values.push(jobId);
    let sql = `update public.atlas_work_queue_jobs set ${fields.join(", ")} where job_id = $${values.length}`;
    if (expectedLeaseOwner) {
      values.push(expectedLeaseOwner);
      sql += ` and lease_owner = $${values.length}`;
    }
    sql += " returning *";
    const res = await this.pool.query(sql, values);
    if (!res.rowCount) return null;
    const steps = await this.loadSteps(this.pool, jobId);
    return rowToJob(res.rows[0] as Record<string, unknown>, steps);
  }

  async updateStep(step: WorkStepRecord): Promise<WorkStepRecord> {
    const res = await this.pool.query(
      `update public.atlas_work_queue_steps set
         status = $1,
         attempt = $2,
         input_bindings = $3::jsonb,
         output_bindings = $4::jsonb,
         artifact_ids = $5::jsonb,
         error_code = $6,
         error_message = $7,
         started_at = $8,
         completed_at = $9,
         updated_at = $10
       where job_id = $11 and step_id = $12
       returning *`,
      [
        step.status,
        step.attempt,
        JSON.stringify(step.inputBindings),
        JSON.stringify(step.outputBindings),
        JSON.stringify(step.artifactIds),
        step.errorCode,
        step.errorMessage,
        step.startedAt,
        step.completedAt,
        new Date().toISOString(),
        step.jobId,
        step.stepId,
      ],
    );
    if (!res.rowCount) throw new Error(`step_not_found:${step.jobId}:${step.stepId}`);
    return rowToStep(res.rows[0] as Record<string, unknown>);
  }

  async listStuck(nowMs: number, stuckMs: number): Promise<WorkJobRecord[]> {
    const cutoff = new Date(nowMs - stuckMs).toISOString();
    const res = await this.pool.query(
      `select * from public.atlas_work_queue_jobs
       where status in ('leased', 'running')
         and heartbeat_at is not null
         and heartbeat_at < $1::timestamptz
       limit 100`,
      [cutoff],
    );
    const jobs: WorkJobRecord[] = [];
    for (const row of res.rows) {
      const steps = await this.loadSteps(this.pool, String(row.job_id));
      jobs.push(rowToJob(row as Record<string, unknown>, steps));
    }
    return jobs;
  }

  async listByStatus(
    status: WorkJobStatus,
    limit = 100,
  ): Promise<WorkJobRecord[]> {
    const res = await this.pool.query(
      `select * from public.atlas_work_queue_jobs where status = $1 limit $2`,
      [status, limit],
    );
    const jobs: WorkJobRecord[] = [];
    for (const row of res.rows) {
      const steps = await this.loadSteps(this.pool, String(row.job_id));
      jobs.push(rowToJob(row as Record<string, unknown>, steps));
    }
    return jobs;
  }

  async metrics(nowMs = Date.now()): Promise<WorkQueueMetrics> {
    const res = await this.pool.query(
      `select status, count(*)::int as c,
              min(extract(epoch from (now() - created_at)) * 1000)::float8 as oldest_ms
       from public.atlas_work_queue_jobs
       group by status`,
    );
    const map = new Map<string, { c: number; oldest: number | null }>();
    for (const row of res.rows) {
      map.set(String(row.status), {
        c: Number(row.c),
        oldest: row.oldest_ms == null ? null : Number(row.oldest_ms),
      });
    }
    const stuckRes = await this.pool.query(
      `select count(*)::int as c from public.atlas_work_queue_jobs
       where status in ('leased','running')
         and heartbeat_at < $1::timestamptz`,
      [new Date(nowMs - 90_000).toISOString()],
    );
    const delays = (
      await this.readMeta<number[]>("schedule_delays", [])
    ).slice().sort((a, b) => a - b);
    const execs = (
      await this.readMeta<number[]>("execution_ms", [])
    ).slice().sort((a, b) => a - b);
    const recovery = await this.readMeta<{ success: number; total: number }>(
      "recovery",
      { success: 0, total: 0 },
    );
    const duplicates = await this.readMeta<number>("duplicate_count", 0);
    const schedulerLastSuccessAt = await this.readMeta<string | null>(
      "scheduler_last_success_at",
      null,
    );
    const p = (arr: number[], pct: number) => {
      if (!arr.length) return null;
      return arr[Math.min(arr.length - 1, Math.ceil((pct / 100) * arr.length) - 1)]!;
    };
    const queued = map.get("queued")?.c ?? 0;
    const completed = map.get("completed")?.c ?? 0;
    const failed = map.get("failed")?.c ?? 0;
    const deadLetter = map.get("dead_letter")?.c ?? 0;
    const terminal = completed + failed + deadLetter;
    const cronEnabled =
      process.env.ENABLE_SCHEDULED_CRON?.trim().toLowerCase() !== "false";
    let alive = cronEnabled;
    if (schedulerLastSuccessAt) {
      const age = nowMs - new Date(schedulerLastSuccessAt).getTime();
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
      stuck: Number(stuckRes.rows[0]?.c ?? 0),
      failed,
      deadLetter,
      completed,
      oldestQueuedAgeMs: map.get("queued")?.oldest ?? null,
      duplicateCount: duplicates,
      schedulerLastSuccessAt,
      p95ScheduleDelayMs: p(delays, 95),
      p99ScheduleDelayMs: p(delays, 99),
      averageDelayMs:
        delays.length === 0
          ? null
          : delays.reduce((a, b) => a + b, 0) / delays.length,
      p95ExecutionMs: p(execs, 95),
      recoverySuccessRate:
        recovery.total > 0 ? recovery.success / recovery.total : null,
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
    await this.writeMeta("scheduler_last_success_at", atIso);
  }

  async recordScheduleDelay(delayMs: number): Promise<void> {
    const delays = await this.readMeta<number[]>("schedule_delays", []);
    delays.push(delayMs);
    await this.writeMeta(
      "schedule_delays",
      delays.length > 5000 ? delays.slice(-2000) : delays,
    );
  }

  async recordExecutionMs(durationMs: number): Promise<void> {
    const execs = await this.readMeta<number[]>("execution_ms", []);
    execs.push(durationMs);
    await this.writeMeta(
      "execution_ms",
      execs.length > 5000 ? execs.slice(-2000) : execs,
    );
  }

  async recordRecovery(success: boolean): Promise<void> {
    const recovery = await this.readMeta<{ success: number; total: number }>(
      "recovery",
      { success: 0, total: 0 },
    );
    recovery.total += 1;
    if (success) recovery.success += 1;
    await this.writeMeta("recovery", recovery);
  }

  async getSideEffect(
    idempotencyKey: string,
  ): Promise<WorkSideEffectRecord | null> {
    try {
      const res = await this.pool.query(
        `select * from public.atlas_work_queue_side_effects where idempotency_key = $1`,
        [idempotencyKey],
      );
      if (!res.rowCount) return null;
      const row = res.rows[0] as Record<string, unknown>;
      return {
        idempotencyKey: String(row.idempotency_key),
        jobId: String(row.job_id),
        runId: String(row.run_id),
        stepId: String(row.step_id),
        kind: String(row.kind),
        result: (row.result as Record<string, unknown>) ?? {},
        createdAt: new Date(String(row.created_at)).toISOString(),
      };
    } catch {
      return null;
    }
  }

  async tryRecordSideEffect(input: {
    idempotencyKey: string;
    jobId: string;
    runId: string;
    stepId: string;
    kind: string;
    result: Record<string, unknown>;
  }): Promise<{ created: boolean; record: WorkSideEffectRecord }> {
    try {
      const res = await this.pool.query(
        `insert into public.atlas_work_queue_side_effects (
           idempotency_key, job_id, run_id, step_id, kind, result, created_at
         ) values ($1,$2,$3,$4,$5,$6::jsonb, now())
         on conflict (idempotency_key) do nothing
         returning *`,
        [
          input.idempotencyKey,
          input.jobId,
          input.runId,
          input.stepId,
          input.kind,
          JSON.stringify(input.result),
        ],
      );
      if (res.rowCount && res.rows[0]) {
        const row = res.rows[0] as Record<string, unknown>;
        return {
          created: true,
          record: {
            idempotencyKey: String(row.idempotency_key),
            jobId: String(row.job_id),
            runId: String(row.run_id),
            stepId: String(row.step_id),
            kind: String(row.kind),
            result: (row.result as Record<string, unknown>) ?? {},
            createdAt: new Date(String(row.created_at)).toISOString(),
          },
        };
      }
    } catch {
      // fall through to get
    }
    const existing = await this.getSideEffect(input.idempotencyKey);
    if (existing) return { created: false, record: existing };
    // Table missing — ephemeral record (still returned; caller treats as created).
    return {
      created: true,
      record: {
        idempotencyKey: input.idempotencyKey,
        jobId: input.jobId,
        runId: input.runId,
        stepId: input.stepId,
        kind: input.kind,
        result: input.result,
        createdAt: new Date().toISOString(),
      },
    };
  }

  async appendRetryHistory(
    jobId: string,
    entry: WorkRetryHistoryEntry,
  ): Promise<void> {
    try {
      await this.pool.query(
        `update public.atlas_work_queue_jobs
         set retry_history = coalesce(retry_history, '[]'::jsonb) || $2::jsonb,
             updated_at = now()
         where job_id = $1`,
        [jobId, JSON.stringify([entry])],
      );
    } catch {
      // column may be missing before migration
    }
  }

  async resetForTests(): Promise<void> {
    await this.pool.query(
      "truncate public.atlas_work_queue_side_effects, public.atlas_work_queue_steps, public.atlas_work_queue_jobs, public.atlas_work_queue_meta",
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function tryCreatePostgresWorkQueueStore(): PostgresWorkQueueStore | null {
  const url = resolveDatabaseUrl();
  if (!url) return null;
  return new PostgresWorkQueueStore(url);
}

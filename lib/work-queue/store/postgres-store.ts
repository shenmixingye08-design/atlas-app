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
  WorkStepRecord,
} from "../types";
import type { WorkQueueStore } from "./interface";

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
  private metaDelays: number[] = [];
  private metaExec: number[] = [];
  private metaRecoverySuccess = 0;
  private metaRecoveryTotal = 0;
  private metaDuplicates = 0;
  private schedulerLastSuccessAt: string | null = null;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 10_000,
    });
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
        this.metaDuplicates += 1;
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
    const delays = [...this.metaDelays].sort((a, b) => a - b);
    const execs = [...this.metaExec].sort((a, b) => a - b);
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
      stuck: Number(stuckRes.rows[0]?.c ?? 0),
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
    if (this.metaDelays.length > 5000) this.metaDelays = this.metaDelays.slice(-2000);
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
    await this.pool.query("truncate public.atlas_work_queue_steps, public.atlas_work_queue_jobs");
    this.metaDelays = [];
    this.metaExec = [];
    this.metaRecoverySuccess = 0;
    this.metaRecoveryTotal = 0;
    this.metaDuplicates = 0;
    this.schedulerLastSuccessAt = null;
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

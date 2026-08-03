import "server-only";

import type { DurableSotPool } from "../db";
import { mapJob } from "../mappers";
import { DURABLE_QUEUE_STATUSES } from "../schema";
import type {
  DurableJobRecord,
  DurableQueueStatus,
  UpdateDurableJobInput,
} from "../types";
import { DurableJobsRepository } from "./jobs-repository";

type Queryable = Pick<DurableSotPool, "query">;

/**
 * DurableQueueRepository — Queue CRUD / status / retry via Job rows.
 * Repository only; no worker/scheduler business logic.
 */
export class DurableQueueRepository {
  private readonly jobs: DurableJobsRepository;

  constructor(private readonly db: Queryable) {
    this.jobs = new DurableJobsRepository(db);
  }

  /** Queue add — ensure status=queued projection. */
  async enqueue(job: DurableJobRecord): Promise<DurableJobRecord> {
    if (job.status !== "queued") {
      const updated = await this.jobs.update(job.jobId, {
        status: "queued",
        availableAt: new Date().toISOString(),
        leaseOwner: null,
        leaseExpiresAt: null,
      });
      if (!updated) {
        throw new Error(`queue enqueue failed: job ${job.jobId} missing`);
      }
      return updated;
    }
    const existing = await this.jobs.get(job.jobId);
    if (!existing) {
      throw new Error(`queue enqueue failed: job ${job.jobId} missing`);
    }
    return existing;
  }

  async get(jobId: string): Promise<DurableJobRecord | null> {
    return this.jobs.get(jobId);
  }

  async update(
    jobId: string,
    patch: UpdateDurableJobInput,
  ): Promise<DurableJobRecord | null> {
    if (patch.status && !isAllowedQueueStatus(patch.status)) {
      throw new Error(`invalid queue status: ${patch.status}`);
    }
    return this.jobs.update(jobId, patch);
  }

  async delete(jobId: string): Promise<boolean> {
    return this.jobs.delete(jobId);
  }

  async setStatus(
    jobId: string,
    status: DurableQueueStatus,
  ): Promise<DurableJobRecord | null> {
    const patch: UpdateDurableJobInput = { status };
    if (status === "running" || status === "leased") {
      patch.startedAt = new Date().toISOString();
    }
    if (
      status === "completed" ||
      status === "failed" ||
      status === "cancelled" ||
      status === "dead_letter"
    ) {
      patch.completedAt = new Date().toISOString();
    }
    return this.jobs.update(jobId, patch);
  }

  /**
   * Queue retry — status=retry + retry_at.
   * Does not invent retry policy math (caller supplies attempt/retryAt).
   */
  async retry(input: {
    jobId: string;
    attempt: number;
    retryAt: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  }): Promise<DurableJobRecord | null> {
    return this.jobs.update(input.jobId, {
      status: "retry",
      attempt: input.attempt,
      retryAt: input.retryAt,
      availableAt: input.retryAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    });
  }

  async status(jobId: string): Promise<DurableQueueStatus | null> {
    const job = await this.jobs.get(jobId);
    if (!job) return null;
    return normalizeQueueStatus(job.status);
  }

  async listByStatus(
    status: DurableQueueStatus,
    limit = 50,
  ): Promise<DurableJobRecord[]> {
    return this.jobs.listByStatus(status, limit);
  }

  async listDue(nowIso: string, limit = 20): Promise<DurableJobRecord[]> {
    const res = await this.db.query(
      `select * from public.atlas_durable_jobs
       where status in ('queued', 'retry', 'retry_scheduled')
         and available_at <= $1::timestamptz
       order by priority desc, available_at asc
       limit $2`,
      [nowIso, limit],
    );
    return res.rows.map((row) => mapJob(row as Record<string, unknown>));
  }

  async lease(input: {
    jobId: string;
    leaseOwner: string;
    leaseExpiresAt: string;
  }): Promise<DurableJobRecord | null> {
    const now = new Date().toISOString();
    const res = await this.db.query(
      `update public.atlas_durable_jobs set
         status = 'leased',
         lease_owner = $2,
         lease_expires_at = $3,
         heartbeat_at = $4,
         started_at = coalesce(started_at, $4::timestamptz),
         updated_at = $4
       where job_id = $1
         and status in ('queued', 'retry', 'retry_scheduled')
         and available_at <= $4::timestamptz
       returning *`,
      [input.jobId, input.leaseOwner, input.leaseExpiresAt, now],
    );
    if (!res.rowCount) return null;
    return mapJob(res.rows[0] as Record<string, unknown>);
  }

  /**
   * Claim due jobs with SKIP LOCKED (multi-instance safe).
   * Repository primitive only — no worker scheduling policy.
   */
  async claimDue(input: {
    nowIso: string;
    leaseOwner: string;
    leaseExpiresAt: string;
    limit: number;
  }): Promise<DurableJobRecord[]> {
    const res = await this.db.query(
      `with cte as (
         select job_id from public.atlas_durable_jobs
         where (
           status in ('queued', 'retry', 'retry_scheduled')
           and available_at <= $1::timestamptz
         ) or (
           status in ('leased', 'running')
           and lease_expires_at is not null
           and lease_expires_at < $1::timestamptz
         )
         order by priority desc, available_at asc
         for update skip locked
         limit $2
       )
       update public.atlas_durable_jobs j
       set status = 'leased',
           lease_owner = $3,
           lease_expires_at = $4::timestamptz,
           heartbeat_at = $1::timestamptz,
           started_at = coalesce(started_at, $1::timestamptz),
           updated_at = $1::timestamptz
       from cte
       where j.job_id = cte.job_id
       returning j.*`,
      [input.nowIso, input.limit, input.leaseOwner, input.leaseExpiresAt],
    );
    return res.rows.map((row) => mapJob(row as Record<string, unknown>));
  }

  async stats(): Promise<Record<DurableQueueStatus, number> & { total: number }> {
    const counts = await this.statusCounts();
    const base: Record<DurableQueueStatus, number> = {
      queued: 0,
      leased: 0,
      running: 0,
      retry: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      dead_letter: 0,
    };
    let total = 0;
    for (const row of counts) {
      total += row.count;
      const normalized = normalizeQueueStatus(row.status);
      if (normalized) base[normalized] += row.count;
    }
    return { ...base, total };
  }

  async statusCounts(): Promise<
    Array<{ status: string; count: number; oldestAgeMs: number | null }>
  > {
    const res = await this.db.query<{
      status: string;
      c: number;
      oldest_ms: number | null;
    }>(
      `select status, count(*)::int as c,
              min(extract(epoch from (now() - created_at)) * 1000)::float8 as oldest_ms
       from public.atlas_durable_jobs
       group by status`,
    );
    return res.rows.map((row) => ({
      status: String(row.status),
      count: Number(row.c),
      oldestAgeMs: row.oldest_ms == null ? null : Number(row.oldest_ms),
    }));
  }

  async listStuck(cutoffIso: string, limit = 100): Promise<DurableJobRecord[]> {
    const res = await this.db.query(
      `select * from public.atlas_durable_jobs
       where status in ('leased', 'running')
         and heartbeat_at is not null
         and heartbeat_at < $1::timestamptz
       limit $2`,
      [cutoffIso, limit],
    );
    return res.rows.map((row) => mapJob(row as Record<string, unknown>));
  }

  async countStuck(cutoffIso: string): Promise<number> {
    const res = await this.db.query<{ c: number }>(
      `select count(*)::int as c from public.atlas_durable_jobs
       where status in ('leased','running')
         and heartbeat_at < $1::timestamptz`,
      [cutoffIso],
    );
    return Number(res.rows[0]?.c ?? 0);
  }

  async heartbeat(input: {
    jobId: string;
    leaseOwner: string;
    leaseExpiresAt: string;
    heartbeatAt?: string;
  }): Promise<boolean> {
    const now = input.heartbeatAt ?? new Date().toISOString();
    const res = await this.db.query(
      `update public.atlas_durable_jobs
       set heartbeat_at = $1::timestamptz,
           lease_expires_at = $2::timestamptz,
           updated_at = $1::timestamptz
       where job_id = $3
         and lease_owner = $4
         and status in ('leased', 'running')`,
      [now, input.leaseExpiresAt, input.jobId, input.leaseOwner],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async resetAll(): Promise<void> {
    await this.db.query(
      `truncate table public.atlas_durable_jobs, public.atlas_durable_steps, public.atlas_durable_runs, public.atlas_durable_scheduler_occurrences cascade`,
    );
  }
}

function isAllowedQueueStatus(status: string): boolean {
  return (
    (DURABLE_QUEUE_STATUSES as readonly string[]).includes(status) ||
    status === "retry_scheduled" ||
    status === "waiting_approval" ||
    status === "waiting_input" ||
    status === "partially_completed"
  );
}

function normalizeQueueStatus(status: string): DurableQueueStatus | null {
  if (status === "retry_scheduled") return "retry";
  if ((DURABLE_QUEUE_STATUSES as readonly string[]).includes(status)) {
    return status as DurableQueueStatus;
  }
  return null;
}

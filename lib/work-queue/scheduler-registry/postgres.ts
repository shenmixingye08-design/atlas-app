import { randomUUID } from "node:crypto";

import pg from "pg";

import type {
  SchedulerExecutionLog,
  SchedulerLifecycleStatus,
  SchedulerScheduleRecord,
} from "./types";
import { SCHEDULER_STATUS_TRANSITIONS } from "./types";
import type { UpsertScheduleInput } from "./store";

function canTransition(
  from: SchedulerLifecycleStatus,
  to: SchedulerLifecycleStatus,
): boolean {
  if (from === to) return true;
  return SCHEDULER_STATUS_TRANSITIONS[from].includes(to);
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

function rowToSchedule(row: Record<string, unknown>): SchedulerScheduleRecord {
  return {
    scheduleId: String(row.schedule_id),
    automationId: String(row.automation_id),
    ownerId: String(row.owner_id),
    cronExpression: String(row.cron_expression),
    timezone: String(row.timezone),
    presetType: String(row.preset_type),
    nextRun: row.next_run ? new Date(String(row.next_run)).toISOString() : null,
    lastRun: row.last_run ? new Date(String(row.last_run)).toISOString() : null,
    lastSuccess: row.last_success
      ? new Date(String(row.last_success)).toISOString()
      : null,
    lastFailure: row.last_failure
      ? new Date(String(row.last_failure)).toISOString()
      : null,
    retryCount: Number(row.retry_count ?? 0),
    executionTime: row.execution_time
      ? new Date(String(row.execution_time)).toISOString()
      : null,
    durationMs:
      row.duration_ms == null ? null : Number(row.duration_ms),
    status: row.status as SchedulerLifecycleStatus,
    enabled: Boolean(row.enabled),
    idempotencyKey: (row.idempotency_key as string | null) ?? null,
    lockOwner: (row.lock_owner as string | null) ?? null,
    lockExpiresAt: row.lock_expires_at
      ? new Date(String(row.lock_expires_at)).toISOString()
      : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function rowToLog(row: Record<string, unknown>): SchedulerExecutionLog {
  return {
    logId: String(row.log_id),
    scheduleId: String(row.schedule_id),
    automationId: String(row.automation_id),
    ownerId: String(row.owner_id),
    jobId: row.job_id ? String(row.job_id) : null,
    occurrenceKey: String(row.occurrence_key),
    idempotencyKey: String(row.idempotency_key),
    status: row.status as SchedulerExecutionLog["status"],
    startedAt: row.started_at
      ? new Date(String(row.started_at)).toISOString()
      : null,
    finishedAt: row.finished_at
      ? new Date(String(row.finished_at)).toISOString()
      : null,
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    retryCount: Number(row.retry_count ?? 0),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

/** Postgres-backed Scheduler registry — production SoT. */
export class PostgresSchedulerRegistryStore {
  readonly kind = "postgres" as const;
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
    });
  }

  async upsertSchedule(input: UpsertScheduleInput): Promise<SchedulerScheduleRecord> {
    const scheduleId = `sch_${input.automationId}`;
    const res = await this.pool.query(
      `insert into public.atlas_scheduler_schedules (
         schedule_id, automation_id, owner_id, cron_expression, timezone,
         preset_type, next_run, status, enabled, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,
         case when $8 then 'scheduled' else 'stopped' end,
         $8, now())
       on conflict (automation_id) do update set
         owner_id = excluded.owner_id,
         cron_expression = excluded.cron_expression,
         timezone = excluded.timezone,
         preset_type = excluded.preset_type,
         next_run = excluded.next_run,
         enabled = excluded.enabled,
         status = case
           when excluded.enabled = false then 'stopped'
           when public.atlas_scheduler_schedules.status = 'stopped' then 'scheduled'
           else public.atlas_scheduler_schedules.status
         end,
         updated_at = now()
       returning *`,
      [
        scheduleId,
        input.automationId,
        input.ownerId,
        input.cronExpression,
        input.timezone,
        input.presetType,
        input.nextRun,
        input.enabled,
      ],
    );
    return rowToSchedule(res.rows[0] as Record<string, unknown>);
  }

  async getByAutomationId(
    automationId: string,
  ): Promise<SchedulerScheduleRecord | null> {
    const res = await this.pool.query(
      `select * from public.atlas_scheduler_schedules where automation_id = $1`,
      [automationId],
    );
    if (!res.rowCount) return null;
    return rowToSchedule(res.rows[0] as Record<string, unknown>);
  }

  async transitionStatus(input: {
    scheduleId: string;
    to: SchedulerLifecycleStatus;
    patch?: Partial<
      Pick<
        SchedulerScheduleRecord,
        | "nextRun"
        | "lastRun"
        | "lastSuccess"
        | "lastFailure"
        | "retryCount"
        | "executionTime"
        | "durationMs"
        | "idempotencyKey"
        | "lockOwner"
        | "lockExpiresAt"
      >
    >;
  }): Promise<SchedulerScheduleRecord | null> {
    const current = await this.pool.query(
      `select * from public.atlas_scheduler_schedules where schedule_id = $1`,
      [input.scheduleId],
    );
    if (!current.rowCount) return null;
    const from = String(current.rows[0]!.status) as SchedulerLifecycleStatus;
    if (!canTransition(from, input.to)) {
      throw new Error(`scheduler_invalid_transition:${from}->${input.to}`);
    }
    const patch = input.patch ?? {};
    const res = await this.pool.query(
      `update public.atlas_scheduler_schedules set
         status = $2,
         next_run = coalesce($3, next_run),
         last_run = coalesce($4, last_run),
         last_success = coalesce($5, last_success),
         last_failure = coalesce($6, last_failure),
         retry_count = coalesce($7, retry_count),
         execution_time = coalesce($8, execution_time),
         duration_ms = coalesce($9, duration_ms),
         idempotency_key = coalesce($10, idempotency_key),
         lock_owner = $11,
         lock_expires_at = $12,
         updated_at = now()
       where schedule_id = $1
       returning *`,
      [
        input.scheduleId,
        input.to,
        patch.nextRun ?? null,
        patch.lastRun ?? null,
        patch.lastSuccess ?? null,
        patch.lastFailure ?? null,
        patch.retryCount ?? null,
        patch.executionTime ?? null,
        patch.durationMs ?? null,
        patch.idempotencyKey ?? null,
        patch.lockOwner === undefined
          ? current.rows[0]!.lock_owner
          : patch.lockOwner,
        patch.lockExpiresAt === undefined
          ? current.rows[0]!.lock_expires_at
          : patch.lockExpiresAt,
      ],
    );
    return rowToSchedule(res.rows[0] as Record<string, unknown>);
  }

  async tryAcquireLock(input: {
    scheduleId: string;
    lockOwner: string;
    leaseMs: number;
    nowMs?: number;
  }): Promise<boolean> {
    const now = input.nowMs ?? Date.now();
    const expires = new Date(now + input.leaseMs).toISOString();
    const res = await this.pool.query(
      `update public.atlas_scheduler_schedules set
         lock_owner = $2,
         lock_expires_at = $3::timestamptz,
         updated_at = now()
       where schedule_id = $1
         and enabled = true
         and status <> 'stopped'
         and (
           lock_owner is null
           or lock_expires_at is null
           or lock_expires_at <= now()
           or lock_owner = $2
         )
       returning schedule_id`,
      [input.scheduleId, input.lockOwner, expires],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async releaseLock(scheduleId: string, lockOwner: string): Promise<void> {
    await this.pool.query(
      `update public.atlas_scheduler_schedules set
         lock_owner = null,
         lock_expires_at = null,
         updated_at = now()
       where schedule_id = $1 and lock_owner = $2`,
      [scheduleId, lockOwner],
    );
  }

  async appendExecutionLog(
    input: Omit<SchedulerExecutionLog, "logId" | "createdAt"> & {
      logId?: string;
    },
  ): Promise<{ log: SchedulerExecutionLog; created: boolean }> {
    const logId = input.logId ?? randomUUID();
    try {
      const res = await this.pool.query(
        `insert into public.atlas_scheduler_execution_logs (
           log_id, schedule_id, automation_id, owner_id, job_id,
           occurrence_key, idempotency_key, status, started_at, finished_at,
           duration_ms, error_code, error_message, retry_count
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         returning *`,
        [
          logId,
          input.scheduleId,
          input.automationId,
          input.ownerId,
          input.jobId,
          input.occurrenceKey,
          input.idempotencyKey,
          input.status,
          input.startedAt,
          input.finishedAt,
          input.durationMs,
          input.errorCode,
          input.errorMessage,
          input.retryCount,
        ],
      );
      return {
        log: rowToLog(res.rows[0] as Record<string, unknown>),
        created: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unique|duplicate/i.test(message)) {
        const existing = await this.pool.query(
          `select * from public.atlas_scheduler_execution_logs where idempotency_key = $1`,
          [input.idempotencyKey],
        );
        if (existing.rowCount) {
          return {
            log: rowToLog(existing.rows[0] as Record<string, unknown>),
            created: false,
          };
        }
      }
      throw error;
    }
  }

  async updateExecutionLog(
    logId: string,
    patch: Partial<SchedulerExecutionLog>,
  ): Promise<SchedulerExecutionLog | null> {
    const res = await this.pool.query(
      `update public.atlas_scheduler_execution_logs set
         status = coalesce($2, status),
         started_at = coalesce($3, started_at),
         finished_at = coalesce($4, finished_at),
         duration_ms = coalesce($5, duration_ms),
         error_code = coalesce($6, error_code),
         error_message = coalesce($7, error_message),
         retry_count = coalesce($8, retry_count),
         job_id = coalesce($9, job_id)
       where log_id = $1
       returning *`,
      [
        logId,
        patch.status ?? null,
        patch.startedAt ?? null,
        patch.finishedAt ?? null,
        patch.durationMs ?? null,
        patch.errorCode ?? null,
        patch.errorMessage ?? null,
        patch.retryCount ?? null,
        patch.jobId ?? null,
      ],
    );
    if (!res.rowCount) return null;
    return rowToLog(res.rows[0] as Record<string, unknown>);
  }

  async listLogs(limit = 200): Promise<SchedulerExecutionLog[]> {
    const res = await this.pool.query(
      `select * from public.atlas_scheduler_execution_logs
       order by created_at desc limit $1`,
      [limit],
    );
    return res.rows.map((row) => rowToLog(row as Record<string, unknown>));
  }

  async listSchedules(): Promise<SchedulerScheduleRecord[]> {
    const res = await this.pool.query(
      `select * from public.atlas_scheduler_schedules order by updated_at desc`,
    );
    return res.rows.map((row) => rowToSchedule(row as Record<string, unknown>));
  }

  async resetForTests(): Promise<void> {
    await this.pool.query(
      `truncate public.atlas_scheduler_execution_logs, public.atlas_scheduler_schedules`,
    );
  }
}

export function tryCreatePostgresSchedulerRegistry(): PostgresSchedulerRegistryStore | null {
  if (
    process.env.ATLAS_WORK_QUEUE_FORCE_FILE?.trim().toLowerCase() === "true" ||
    process.env.ATLAS_SCHEDULER_FORCE_FILE?.trim().toLowerCase() === "true"
  ) {
    return null;
  }
  const url = resolveDatabaseUrl();
  if (!url) return null;
  return new PostgresSchedulerRegistryStore(url);
}

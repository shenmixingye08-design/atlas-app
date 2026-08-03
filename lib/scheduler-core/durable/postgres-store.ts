import { randomUUID } from "node:crypto";

import pg from "pg";

import type { SchedulerOutboxRow, SchedulerTickHistory } from "../types";
import type {
  SchedulerCoreDurableStore,
  SchedulerScheduleIndexRow,
} from "./types";

function resolveDatabaseUrl(): string | null {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.SUPABASE_DB_URL?.trim() ||
    process.env.DIRECT_URL?.trim() ||
    "";
  return url || null;
}

export function tryCreateSchedulerCorePostgresStore(): SchedulerCoreDurableStore | null {
  const url = resolveDatabaseUrl();
  if (!url) return null;

  const pool = new pg.Pool({ connectionString: url, max: 4 });

  return {
    kind: "postgres",
    async upsertSchedule(row) {
      await pool.query(
        `insert into public.atlas_scheduler_schedules (
          automation_id, owner_id, environment, enabled, paused, deleted_at,
          next_run_at, timezone, end_at, misfire_policy, name, updated_at, created_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        on conflict (automation_id) do update set
          owner_id = excluded.owner_id,
          environment = excluded.environment,
          enabled = excluded.enabled,
          paused = excluded.paused,
          deleted_at = excluded.deleted_at,
          next_run_at = excluded.next_run_at,
          timezone = excluded.timezone,
          end_at = excluded.end_at,
          misfire_policy = excluded.misfire_policy,
          name = excluded.name,
          updated_at = excluded.updated_at`,
        [
          row.automationId,
          row.ownerId,
          row.environment,
          row.enabled,
          row.paused,
          row.deletedAt,
          row.nextRunAt,
          row.timezone,
          row.endAt,
          row.misfirePolicy,
          row.name,
          row.updatedAt,
          row.createdAt,
        ],
      );
    },
    async listDueSchedules({ environment, nowIso, limit }) {
      const res = await pool.query(
        `select * from public.atlas_scheduler_schedules
         where environment = $1
           and enabled = true
           and paused = false
           and deleted_at is null
           and next_run_at is not null
           and next_run_at <= $2::timestamptz
           and (end_at is null or end_at > $2::timestamptz)
         order by next_run_at asc
         limit $3`,
        [environment, nowIso, limit],
      );
      return res.rows.map(mapScheduleRow);
    },
    async updateScheduleNextRun(automationId, nextRunAt) {
      await pool.query(
        `update public.atlas_scheduler_schedules
         set next_run_at = $2, updated_at = now()
         where automation_id = $1`,
        [automationId, nextRunAt],
      );
    },
    async insertTick(history) {
      await pool.query(
        `insert into public.atlas_scheduler_ticks (
          scheduler_tick_id, request_id, environment, started_at, completed_at,
          duration_ms, due_count, occurrence_created_count, duplicate_skipped_count,
          invalid_schedule_count, failed_count, outbox_created_count,
          next_run_updated_count, misfire_skipped_count, status, error_code, diagnostic_id
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          history.schedulerTickId,
          history.requestId,
          history.environment,
          history.startedAt,
          history.completedAt,
          history.durationMs,
          history.dueCount,
          history.occurrenceCreatedCount,
          history.duplicateSkippedCount,
          history.invalidScheduleCount,
          history.failedCount,
          history.outboxCreatedCount,
          history.nextRunUpdatedCount,
          history.misfireSkippedCount,
          history.status,
          history.errorCode,
          history.diagnosticId,
        ],
      );
    },
    async completeTick(history) {
      await pool.query(
        `update public.atlas_scheduler_ticks set
          completed_at = $2, duration_ms = $3, due_count = $4,
          occurrence_created_count = $5, duplicate_skipped_count = $6,
          invalid_schedule_count = $7, failed_count = $8,
          outbox_created_count = $9, next_run_updated_count = $10,
          misfire_skipped_count = $11, status = $12, error_code = $13
         where scheduler_tick_id = $1`,
        [
          history.schedulerTickId,
          history.completedAt,
          history.durationMs,
          history.dueCount,
          history.occurrenceCreatedCount,
          history.duplicateSkippedCount,
          history.invalidScheduleCount,
          history.failedCount,
          history.outboxCreatedCount,
          history.nextRunUpdatedCount,
          history.misfireSkippedCount,
          history.status,
          history.errorCode,
        ],
      );
    },
    async insertOccurrenceLink(link) {
      await pool.query(
        `insert into public.atlas_scheduler_tick_occurrences (
          tick_id, occurrence_key, automation_id, owner_id, run_id, job_id,
          scheduled_at, created, misfire_policy, misfire_action, reason
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          link.tickId,
          link.occurrenceKey,
          link.automationId,
          link.ownerId,
          link.runId,
          link.jobId,
          link.scheduledAt,
          link.created,
          link.misfirePolicy,
          link.misfireAction,
          link.reason,
        ],
      );
    },
    async insertOutbox(row) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const existing = await client.query(
          `select * from public.atlas_scheduler_outbox
           where occurrence_key = $1 and job_id = $2 for update`,
          [row.occurrenceKey, row.jobId],
        );
        if (existing.rows[0]) {
          await client.query("commit");
          return { created: false, row: mapOutboxRow(existing.rows[0]) };
        }
        await client.query(
          `insert into public.atlas_scheduler_outbox (
            outbox_id, tick_id, occurrence_key, automation_id, owner_id,
            run_id, job_id, scheduled_at, payload, status, available_at,
            attempt, dispatched_at, error_code, created_at, updated_at
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            row.outboxId,
            row.tickId,
            row.occurrenceKey,
            row.automationId,
            row.ownerId,
            row.runId,
            row.jobId,
            row.scheduledAt,
            JSON.stringify(row.payload),
            row.status,
            row.availableAt,
            row.attempt,
            row.dispatchedAt,
            row.errorCode,
            row.createdAt,
            row.updatedAt,
          ],
        );
        await client.query("commit");
        return { created: true, row };
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
    async listPendingOutbox(limit) {
      const res = await pool.query(
        `select * from public.atlas_scheduler_outbox
         where status in ('pending','failed') and available_at <= now()
         order by available_at asc limit $1`,
        [limit],
      );
      return res.rows.map(mapOutboxRow);
    },
    async markOutboxDelivered(outboxId, atIso) {
      await pool.query(
        `update public.atlas_scheduler_outbox
         set status = 'delivered', dispatched_at = $2, updated_at = $2
         where outbox_id = $1`,
        [outboxId, atIso],
      );
    },
    async markOutboxFailed(outboxId, errorCode) {
      await pool.query(
        `update public.atlas_scheduler_outbox
         set status = 'failed', error_code = $2, attempt = attempt + 1, updated_at = now()
         where outbox_id = $1`,
        [outboxId, errorCode],
      );
    },
    async getLatestTick() {
      const res = await pool.query(
        `select * from public.atlas_scheduler_ticks order by started_at desc limit 1`,
      );
      return res.rows[0] ? mapTickRow(res.rows[0]) : null;
    },
    async countPendingOutbox() {
      const res = await pool.query(
        `select count(*)::int as c from public.atlas_scheduler_outbox
         where status in ('pending','failed')`,
      );
      return Number(res.rows[0]?.c ?? 0);
    },
    async oldestDueAgeMs(environment, nowMs) {
      const res = await pool.query(
        `select min(next_run_at) as oldest from public.atlas_scheduler_schedules
         where environment = $1 and enabled and not paused and deleted_at is null
           and next_run_at is not null and next_run_at <= to_timestamp($2/1000.0)`,
        [environment, nowMs],
      );
      const oldest = res.rows[0]?.oldest;
      if (!oldest) return null;
      return Math.max(0, nowMs - new Date(oldest).getTime());
    },
    async resetForTests() {
      // Intentionally no-op against shared DBs; tests use file store.
      void randomUUID;
    },
  };
}

function mapScheduleRow(row: Record<string, unknown>): SchedulerScheduleIndexRow {
  return {
    automationId: String(row.automation_id),
    ownerId: String(row.owner_id),
    environment: row.environment as SchedulerScheduleIndexRow["environment"],
    enabled: Boolean(row.enabled),
    paused: Boolean(row.paused),
    deletedAt: row.deleted_at ? new Date(String(row.deleted_at)).toISOString() : null,
    nextRunAt: row.next_run_at
      ? new Date(String(row.next_run_at)).toISOString()
      : null,
    timezone: String(row.timezone),
    endAt: row.end_at ? new Date(String(row.end_at)).toISOString() : null,
    misfirePolicy: row.misfire_policy as SchedulerScheduleIndexRow["misfirePolicy"],
    name: String(row.name ?? ""),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function mapOutboxRow(row: Record<string, unknown>): SchedulerOutboxRow {
  return {
    outboxId: String(row.outbox_id),
    tickId: String(row.tick_id),
    occurrenceKey: String(row.occurrence_key),
    automationId: String(row.automation_id),
    ownerId: String(row.owner_id),
    runId: String(row.run_id),
    jobId: String(row.job_id),
    scheduledAt: new Date(String(row.scheduled_at)).toISOString(),
    payload: (row.payload as Record<string, unknown>) ?? {},
    status: row.status as SchedulerOutboxRow["status"],
    availableAt: new Date(String(row.available_at)).toISOString(),
    attempt: Number(row.attempt ?? 0),
    dispatchedAt: row.dispatched_at
      ? new Date(String(row.dispatched_at)).toISOString()
      : null,
    errorCode: (row.error_code as string | null) ?? null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

function mapTickRow(row: Record<string, unknown>): SchedulerTickHistory {
  return {
    schedulerTickId: String(row.scheduler_tick_id),
    requestId: String(row.request_id),
    environment: row.environment as SchedulerTickHistory["environment"],
    startedAt: new Date(String(row.started_at)).toISOString(),
    completedAt: row.completed_at
      ? new Date(String(row.completed_at)).toISOString()
      : null,
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    dueCount: Number(row.due_count ?? 0),
    occurrenceCreatedCount: Number(row.occurrence_created_count ?? 0),
    duplicateSkippedCount: Number(row.duplicate_skipped_count ?? 0),
    invalidScheduleCount: Number(row.invalid_schedule_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    outboxCreatedCount: Number(row.outbox_created_count ?? 0),
    nextRunUpdatedCount: Number(row.next_run_updated_count ?? 0),
    misfireSkippedCount: Number(row.misfire_skipped_count ?? 0),
    status: row.status as SchedulerTickHistory["status"],
    errorCode: (row.error_code as string | null) ?? null,
    diagnosticId: String(row.diagnostic_id),
  };
}

import "server-only";

import { randomUUID } from "node:crypto";

import type { DurableSotPool } from "../db";
import { isUniqueViolation, uniqueConstraintName } from "../db";
import { mapJob } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type {
  CreateDurableJobInput,
  DurableJobRecord,
  UpdateDurableJobInput,
} from "../types";
import { DurableSotUniqueViolationError } from "../types";

const T = DURABLE_SOT_TABLES.jobs;

type Queryable = Pick<DurableSotPool, "query">;

/**
 * JobRepository — DB only. No business logic.
 * Phase 1-3 Single SoT for Job entity.
 */
export class DurableJobsRepository {
  constructor(private readonly db: Queryable) {}

  async create(
    input: CreateDurableJobInput,
    client: Queryable = this.db,
  ): Promise<DurableJobRecord> {
    const jobId = input.jobId ?? randomUUID();
    const now = new Date().toISOString();
    try {
      const res = await client.query(
        `insert into public.${T} (
          job_id, run_id, owner_id, automation_id, occurrence_id, occurrence_key,
          schedule_id, status, priority, available_at, scheduled_at,
          attempt, max_attempts, idempotency_key, payload,
          created_at, updated_at, expires_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12,$13,$14::jsonb,$15,$15,$16
        ) returning *`,
        [
          jobId,
          input.runId,
          input.ownerId,
          input.automationId ?? null,
          input.occurrenceId ?? null,
          input.occurrenceKey,
          input.scheduleId ?? null,
          input.status ?? "queued",
          input.priority ?? 0,
          input.availableAt ?? now,
          input.scheduledAt ?? null,
          input.maxAttempts ?? 5,
          input.idempotencyKey,
          JSON.stringify(input.payload ?? {}),
          now,
          input.expiresAt ?? null,
        ],
      );
      return mapJob(res.rows[0] as Record<string, unknown>);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DurableSotUniqueViolationError(
          "job unique violation",
          uniqueConstraintName(error),
        );
      }
      throw error;
    }
  }

  async update(
    jobId: string,
    patch: UpdateDurableJobInput,
    client: Queryable = this.db,
  ): Promise<DurableJobRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, value: unknown) => {
      values.push(value);
      fields.push(`${col} = $${values.length}`);
    };
    const addJson = (col: string, value: unknown) => {
      values.push(JSON.stringify(value));
      fields.push(`${col} = $${values.length}::jsonb`);
    };

    if (patch.status !== undefined) add("status", patch.status);
    if (patch.priority !== undefined) add("priority", patch.priority);
    if (patch.availableAt !== undefined) add("available_at", patch.availableAt);
    if (patch.scheduledAt !== undefined) add("scheduled_at", patch.scheduledAt);
    if (patch.startedAt !== undefined) add("started_at", patch.startedAt);
    if (patch.completedAt !== undefined) add("completed_at", patch.completedAt);
    if (patch.leaseOwner !== undefined) add("lease_owner", patch.leaseOwner);
    if (patch.leaseExpiresAt !== undefined) {
      add("lease_expires_at", patch.leaseExpiresAt);
    }
    if (patch.leaseToken !== undefined) add("lease_token", patch.leaseToken);
    if (patch.leaseVersion !== undefined) add("lease_version", patch.leaseVersion);
    if (patch.workerInstanceId !== undefined) {
      add("worker_instance_id", patch.workerInstanceId);
    }
    if (patch.workerStartedAt !== undefined) {
      add("worker_started_at", patch.workerStartedAt);
    }
    if (patch.heartbeatAt !== undefined) add("heartbeat_at", patch.heartbeatAt);
    if (patch.attempt !== undefined) add("attempt", patch.attempt);
    if (patch.maxAttempts !== undefined) add("max_attempts", patch.maxAttempts);
    if (patch.retryAt !== undefined) add("retry_at", patch.retryAt);
    if (patch.errorCode !== undefined) add("error_code", patch.errorCode);
    if (patch.errorMessage !== undefined) {
      add("error_message", patch.errorMessage);
    }
    if (patch.diagnosticId !== undefined) {
      add("diagnostic_id", patch.diagnosticId);
    }
    if (patch.failedStage !== undefined) add("failed_stage", patch.failedStage);
    if (patch.firstError !== undefined) add("first_error", patch.firstError);
    if (patch.lastError !== undefined) add("last_error", patch.lastError);
    if (patch.payload !== undefined) addJson("payload", patch.payload);
    if (patch.resultSummary !== undefined) {
      add("result_summary", patch.resultSummary);
    }
    if (patch.expiresAt !== undefined) add("expires_at", patch.expiresAt);
    add("updated_at", new Date().toISOString());

    values.push(jobId);
    const sql = `update public.${T} set ${fields.join(", ")} where job_id = $${values.length} returning *`;
    const res = await client.query(sql, values);
    if (!res.rowCount) return null;
    return mapJob(res.rows[0] as Record<string, unknown>);
  }

  async get(
    jobId: string,
    client: Queryable = this.db,
  ): Promise<DurableJobRecord | null> {
    const res = await client.query(
      `select * from public.${T} where job_id = $1 limit 1`,
      [jobId],
    );
    if (!res.rowCount) return null;
    return mapJob(res.rows[0] as Record<string, unknown>);
  }

  async getByRunId(
    runId: string,
    client: Queryable = this.db,
  ): Promise<DurableJobRecord | null> {
    const res = await client.query(
      `select * from public.${T} where run_id = $1 limit 1`,
      [runId],
    );
    if (!res.rowCount) return null;
    return mapJob(res.rows[0] as Record<string, unknown>);
  }

  async getByIdempotencyKey(
    key: string,
    client: Queryable = this.db,
  ): Promise<DurableJobRecord | null> {
    const res = await client.query(
      `select * from public.${T} where idempotency_key = $1 limit 1`,
      [key],
    );
    if (!res.rowCount) return null;
    return mapJob(res.rows[0] as Record<string, unknown>);
  }

  async getByAutomationOccurrence(
    automationId: string | null,
    occurrenceKey: string,
    client: Queryable = this.db,
  ): Promise<DurableJobRecord | null> {
    const res = await client.query(
      `select * from public.${T}
       where automation_id is not distinct from $1
         and occurrence_key = $2
       limit 1`,
      [automationId, occurrenceKey],
    );
    if (!res.rowCount) return null;
    return mapJob(res.rows[0] as Record<string, unknown>);
  }

  async delete(
    jobId: string,
    client: Queryable = this.db,
  ): Promise<boolean> {
    const res = await client.query(`delete from public.${T} where job_id = $1`, [
      jobId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  async listByStatus(
    status: DurableJobRecord["status"],
    limit = 50,
    client: Queryable = this.db,
  ): Promise<DurableJobRecord[]> {
    const res = await client.query(
      `select * from public.${T}
       where status = $1
       order by priority desc, available_at asc
       limit $2`,
      [status, limit],
    );
    return res.rows.map((row) => mapJob(row as Record<string, unknown>));
  }
}

/** Alias required by Phase 1-3 naming. */
export { DurableJobsRepository as JobRepository };

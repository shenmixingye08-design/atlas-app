import "server-only";

import { randomUUID } from "node:crypto";

import type { DurableSotPool } from "../db";
import { isUniqueViolation, uniqueConstraintName } from "../db";
import { mapRun } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type {
  CreateDurableRunInput,
  DurableRunRecord,
  UpdateDurableRunInput,
} from "../types";
import { DurableSotUniqueViolationError } from "../types";

const T = DURABLE_SOT_TABLES.runs;

export class DurableRunsRepository {
  constructor(private readonly pool: DurableSotPool) {}

  async create(input: CreateDurableRunInput): Promise<DurableRunRecord> {
    const runId = input.runId ?? randomUUID();
    const now = new Date().toISOString();
    try {
      const res = await this.pool.query(
        `insert into public.${T} (
          run_id, owner_id, automation_id, job_id, occurrence_id, status,
          trigger_type, payload, created_at, updated_at, expires_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$9,$10
        ) returning *`,
        [
          runId,
          input.ownerId,
          input.automationId ?? null,
          input.jobId ?? null,
          input.occurrenceId ?? null,
          input.status ?? "pending",
          input.triggerType ?? "manual",
          JSON.stringify(input.payload ?? {}),
          now,
          input.expiresAt ?? null,
        ],
      );
      return mapRun(res.rows[0] as Record<string, unknown>);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DurableSotUniqueViolationError(
          "run unique violation",
          uniqueConstraintName(error),
        );
      }
      throw error;
    }
  }

  async update(
    runId: string,
    patch: UpdateDurableRunInput,
  ): Promise<DurableRunRecord | null> {
    const res = await this.pool.query(
      `update public.${T} set
        status = coalesce($2, status),
        job_id = coalesce($3, job_id),
        occurrence_id = coalesce($4, occurrence_id),
        payload = coalesce($5::jsonb, payload),
        result_summary = coalesce($6, result_summary),
        error_code = coalesce($7, error_code),
        error_message = coalesce($8, error_message),
        started_at = coalesce($9, started_at),
        completed_at = coalesce($10, completed_at),
        expires_at = coalesce($11, expires_at),
        updated_at = $12
       where run_id = $1
       returning *`,
      [
        runId,
        patch.status ?? null,
        patch.jobId === undefined ? null : patch.jobId,
        patch.occurrenceId === undefined ? null : patch.occurrenceId,
        patch.payload === undefined ? null : JSON.stringify(patch.payload),
        patch.resultSummary === undefined ? null : patch.resultSummary,
        patch.errorCode === undefined ? null : patch.errorCode,
        patch.errorMessage === undefined ? null : patch.errorMessage,
        patch.startedAt === undefined ? null : patch.startedAt,
        patch.completedAt === undefined ? null : patch.completedAt,
        patch.expiresAt === undefined ? null : patch.expiresAt,
        new Date().toISOString(),
      ],
    );
    if (!res.rowCount) return null;
    return mapRun(res.rows[0] as Record<string, unknown>);
  }

  async get(runId: string): Promise<DurableRunRecord | null> {
    const res = await this.pool.query(
      `select * from public.${T} where run_id = $1 limit 1`,
      [runId],
    );
    if (!res.rowCount) return null;
    return mapRun(res.rows[0] as Record<string, unknown>);
  }

  async findPending(limit = 50): Promise<DurableRunRecord[]> {
    const res = await this.pool.query(
      `select * from public.${T}
       where status in ('pending', 'queued', 'retry_scheduled')
       order by created_at asc
       limit $1`,
      [limit],
    );
    return res.rows.map((row) => mapRun(row as Record<string, unknown>));
  }

  async findRecoverable(input: {
    nowIso: string;
    limit?: number;
  }): Promise<DurableRunRecord[]> {
    const res = await this.pool.query(
      `select r.*
       from public.${T} r
       left join public.${DURABLE_SOT_TABLES.leases} l on l.run_id = r.run_id
       where r.status in ('leased', 'running')
         and (
           l.run_id is null
           or l.lease_expires_at < $1::timestamptz
         )
       order by r.updated_at asc
       limit $2`,
      [input.nowIso, input.limit ?? 50],
    );
    return res.rows.map((row) => mapRun(row as Record<string, unknown>));
  }
}

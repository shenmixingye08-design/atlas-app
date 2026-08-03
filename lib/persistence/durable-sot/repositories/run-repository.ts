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
import { DurableRunsRepository } from "./runs-repository";

type Queryable = Pick<DurableSotPool, "query">;

/**
 * RunRepository — Phase 1-3 canonical Run SoT.
 * process-memory is forbidden; all reads/writes go to Postgres.
 */
export class RunRepository {
  private readonly inner: DurableRunsRepository;

  constructor(private readonly db: Queryable) {
    this.inner = new DurableRunsRepository(db as DurableSotPool);
  }

  async createRun(
    input: CreateDurableRunInput,
    client: Queryable = this.db,
  ): Promise<DurableRunRecord> {
    const runId = input.runId ?? randomUUID();
    const now = new Date().toISOString();
    try {
      const res = await client.query(
        `insert into public.${DURABLE_SOT_TABLES.runs} (
          run_id, owner_id, automation_id, job_id, occurrence_id, status,
          trigger_type, payload, idempotency_key, created_at, updated_at, expires_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$10,$11
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
          input.idempotencyKey ?? null,
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

  async updateRun(
    runId: string,
    patch: UpdateDurableRunInput,
    client: Queryable = this.db,
  ): Promise<DurableRunRecord | null> {
    const res = await client.query(
      `update public.${DURABLE_SOT_TABLES.runs} set
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

  async getRun(
    runId: string,
    client: Queryable = this.db,
  ): Promise<DurableRunRecord | null> {
    const res = await client.query(
      `select * from public.${DURABLE_SOT_TABLES.runs} where run_id = $1 limit 1`,
      [runId],
    );
    if (!res.rowCount) return null;
    return mapRun(res.rows[0] as Record<string, unknown>);
  }

  async completeRun(
    runId: string,
    input: {
      status?: "succeeded" | "failed" | "cancelled" | "dead_letter";
      resultSummary?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    } = {},
    client: Queryable = this.db,
  ): Promise<DurableRunRecord | null> {
    return this.updateRun(
      runId,
      {
        status: input.status ?? "succeeded",
        resultSummary: input.resultSummary ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        completedAt: new Date().toISOString(),
      },
      client,
    );
  }

  /** Escape hatch to legacy helper used by DurableStore facade. */
  get legacy(): DurableRunsRepository {
    return this.inner;
  }
}

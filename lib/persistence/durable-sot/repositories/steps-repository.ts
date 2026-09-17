import "server-only";

import type { DurableSotPool } from "../db";
import { isUniqueViolation, uniqueConstraintName } from "../db";
import { mapStep } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type { CreateDurableStepInput, DurableStepRecord } from "../types";
import { DurableSotUniqueViolationError } from "../types";

const T = DURABLE_SOT_TABLES.steps;

export class DurableStepsRepository {
  constructor(private readonly pool: DurableSotPool) {}

  async create(input: CreateDurableStepInput): Promise<DurableStepRecord> {
    const now = new Date().toISOString();
    try {
      const res = await this.pool.query(
        `insert into public.${T} (
          run_id, step_id, job_id, step_index, step_type, status, attempt,
          input_bindings, output_bindings, created_at, updated_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$10
        ) returning *`,
        [
          input.runId,
          input.stepId,
          input.jobId ?? null,
          input.stepIndex,
          input.stepType,
          input.status ?? "pending",
          input.attempt ?? 0,
          JSON.stringify(input.inputBindings ?? {}),
          JSON.stringify(input.outputBindings ?? {}),
          now,
        ],
      );
      return mapStep(res.rows[0] as Record<string, unknown>);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DurableSotUniqueViolationError(
          "step unique violation",
          uniqueConstraintName(error),
        );
      }
      throw error;
    }
  }

  async update(
    runId: string,
    stepId: string,
    patch: Partial<
      Pick<
        DurableStepRecord,
        | "status"
        | "attempt"
        | "outputBindings"
        | "errorCode"
        | "errorMessage"
        | "startedAt"
        | "completedAt"
        | "jobId"
      >
    >,
  ): Promise<DurableStepRecord | null> {
    const res = await this.pool.query(
      `update public.${T} set
        status = coalesce($3, status),
        attempt = coalesce($4, attempt),
        output_bindings = coalesce($5::jsonb, output_bindings),
        error_code = coalesce($6, error_code),
        error_message = coalesce($7, error_message),
        started_at = coalesce($8, started_at),
        completed_at = coalesce($9, completed_at),
        job_id = coalesce($10, job_id),
        updated_at = $11
       where run_id = $1 and step_id = $2
       returning *`,
      [
        runId,
        stepId,
        patch.status ?? null,
        patch.attempt ?? null,
        patch.outputBindings === undefined
          ? null
          : JSON.stringify(patch.outputBindings),
        patch.errorCode === undefined ? null : patch.errorCode,
        patch.errorMessage === undefined ? null : patch.errorMessage,
        patch.startedAt === undefined ? null : patch.startedAt,
        patch.completedAt === undefined ? null : patch.completedAt,
        patch.jobId === undefined ? null : patch.jobId,
        new Date().toISOString(),
      ],
    );
    if (!res.rowCount) return null;
    return mapStep(res.rows[0] as Record<string, unknown>);
  }

  async list(runId: string): Promise<DurableStepRecord[]> {
    const res = await this.pool.query(
      `select * from public.${T}
       where run_id = $1
       order by step_index asc`,
      [runId],
    );
    return res.rows.map((row) => mapStep(row as Record<string, unknown>));
  }
}

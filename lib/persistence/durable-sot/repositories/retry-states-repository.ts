import "server-only";

import type { DurableSotPool } from "../db";
import { mapRetry } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type { DurableRetryStateRecord, SaveRetryInput } from "../types";

const T = DURABLE_SOT_TABLES.retryStates;

export class DurableRetryStatesRepository {
  constructor(private readonly pool: DurableSotPool) {}

  async save(input: SaveRetryInput): Promise<DurableRetryStateRecord> {
    const now = new Date().toISOString();
    const res = await this.pool.query(
      `insert into public.${T} (
        run_id, job_id, attempt, max_attempts, retry_at,
        error_code, error_message, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$8)
      on conflict (run_id) do update set
        job_id = coalesce(excluded.job_id, public.${T}.job_id),
        attempt = excluded.attempt,
        max_attempts = excluded.max_attempts,
        retry_at = excluded.retry_at,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at
      returning *`,
      [
        input.runId,
        input.jobId ?? null,
        input.attempt,
        input.maxAttempts,
        input.retryAt ?? null,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        now,
      ],
    );
    return mapRetry(res.rows[0] as Record<string, unknown>);
  }

  async get(runId: string): Promise<DurableRetryStateRecord | null> {
    const res = await this.pool.query(
      `select * from public.${T} where run_id = $1 limit 1`,
      [runId],
    );
    if (!res.rowCount) return null;
    return mapRetry(res.rows[0] as Record<string, unknown>);
  }
}

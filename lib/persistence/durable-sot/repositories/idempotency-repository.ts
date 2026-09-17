import "server-only";

import type { DurableSotPool } from "../db";
import { isUniqueViolation, uniqueConstraintName } from "../db";
import { mapIdempotency } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type {
  DurableIdempotencyRecord,
  RecordIdempotencyInput,
} from "../types";
import { DurableSotUniqueViolationError } from "../types";

const T = DURABLE_SOT_TABLES.idempotencyKeys;

export class DurableIdempotencyRepository {
  constructor(private readonly pool: DurableSotPool) {}

  async record(
    input: RecordIdempotencyInput,
  ): Promise<{ record: DurableIdempotencyRecord; created: boolean }> {
    const now = new Date().toISOString();
    try {
      const res = await this.pool.query(
        `insert into public.${T} (
          scope, idempotency_key, run_id, job_id, payload,
          created_at, updated_at, expires_at
        ) values (
          $1,$2,$3,$4,$5::jsonb,$6,$6,$7
        ) returning *`,
        [
          input.scope,
          input.idempotencyKey,
          input.runId ?? null,
          input.jobId ?? null,
          JSON.stringify(input.payload ?? {}),
          now,
          input.expiresAt ?? null,
        ],
      );
      return {
        record: mapIdempotency(res.rows[0] as Record<string, unknown>),
        created: true,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.find({
          scope: input.scope,
          idempotencyKey: input.idempotencyKey,
        });
        if (existing) {
          return { record: existing, created: false };
        }
        throw new DurableSotUniqueViolationError(
          "idempotency unique violation",
          uniqueConstraintName(error),
        );
      }
      throw error;
    }
  }

  async find(input: {
    scope: string;
    idempotencyKey: string;
  }): Promise<DurableIdempotencyRecord | null> {
    const res = await this.pool.query(
      `select * from public.${T}
       where scope = $1 and idempotency_key = $2
       limit 1`,
      [input.scope, input.idempotencyKey],
    );
    if (!res.rowCount) return null;
    return mapIdempotency(res.rows[0] as Record<string, unknown>);
  }
}

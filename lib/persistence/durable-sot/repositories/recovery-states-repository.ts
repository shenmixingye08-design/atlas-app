import "server-only";

import type { DurableSotPool } from "../db";
import { mapRecovery } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type { DurableRecoveryStateRecord, SaveRecoveryInput } from "../types";

const T = DURABLE_SOT_TABLES.recoveryStates;

export class DurableRecoveryStatesRepository {
  constructor(private readonly pool: DurableSotPool) {}

  async save(input: SaveRecoveryInput): Promise<DurableRecoveryStateRecord> {
    const now = new Date().toISOString();
    const res = await this.pool.query(
      `insert into public.${T} (
        run_id, job_id, recovery_status, reason, last_recovery_at,
        created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$6,$6)
      on conflict (run_id) do update set
        job_id = coalesce(excluded.job_id, public.${T}.job_id),
        recovery_status = excluded.recovery_status,
        reason = excluded.reason,
        last_recovery_at = coalesce(excluded.last_recovery_at, public.${T}.last_recovery_at),
        updated_at = excluded.updated_at
      returning *`,
      [
        input.runId,
        input.jobId ?? null,
        input.recoveryStatus,
        input.reason ?? null,
        input.lastRecoveryAt ?? null,
        now,
      ],
    );
    return mapRecovery(res.rows[0] as Record<string, unknown>);
  }

  async get(runId: string): Promise<DurableRecoveryStateRecord | null> {
    const res = await this.pool.query(
      `select * from public.${T} where run_id = $1 limit 1`,
      [runId],
    );
    if (!res.rowCount) return null;
    return mapRecovery(res.rows[0] as Record<string, unknown>);
  }
}

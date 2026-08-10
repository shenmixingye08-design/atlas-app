import "server-only";

import type { DurableSotPool } from "../db";
import { mapHeartbeat } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type { DurableHeartbeatRecord, SaveHeartbeatInput } from "../types";

const T = DURABLE_SOT_TABLES.heartbeats;

export class DurableHeartbeatsRepository {
  constructor(private readonly pool: DurableSotPool) {}

  async save(input: SaveHeartbeatInput): Promise<DurableHeartbeatRecord> {
    const now = new Date().toISOString();
    const heartbeatAt = input.heartbeatAt ?? now;
    const res = await this.pool.query(
      `insert into public.${T} (
        run_id, job_id, lease_owner, heartbeat_at, created_at, updated_at
      ) values ($1,$2,$3,$4,$5,$5)
      on conflict (run_id) do update set
        job_id = coalesce(excluded.job_id, public.${T}.job_id),
        lease_owner = excluded.lease_owner,
        heartbeat_at = excluded.heartbeat_at,
        updated_at = excluded.updated_at
      returning *`,
      [
        input.runId,
        input.jobId ?? null,
        input.leaseOwner,
        heartbeatAt,
        now,
      ],
    );
    return mapHeartbeat(res.rows[0] as Record<string, unknown>);
  }

  async get(runId: string): Promise<DurableHeartbeatRecord | null> {
    const res = await this.pool.query(
      `select * from public.${T} where run_id = $1 limit 1`,
      [runId],
    );
    if (!res.rowCount) return null;
    return mapHeartbeat(res.rows[0] as Record<string, unknown>);
  }
}

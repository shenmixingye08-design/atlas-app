import "server-only";

import type { DurableSotPool } from "../db";
import { mapHeartbeat } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type { DurableHeartbeatRecord, SaveHeartbeatInput } from "../types";

const T = DURABLE_SOT_TABLES.heartbeats;

type Queryable = Pick<DurableSotPool, "query">;

export class DurableHeartbeatsRepository {
  constructor(private readonly pool: Queryable) {}

  async save(input: SaveHeartbeatInput): Promise<DurableHeartbeatRecord> {
    const now = new Date().toISOString();
    const heartbeatAt = input.heartbeatAt ?? now;
    const res = await this.pool.query(
      `insert into public.${T} (
        run_id, job_id, lease_owner, lease_token, heartbeat_at,
        current_step_id, current_stage, progress_marker,
        last_external_action_id, last_artifact_id, worker_instance_id,
        created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12
      )
      on conflict (run_id) do update set
        job_id = coalesce(excluded.job_id, public.${T}.job_id),
        lease_owner = excluded.lease_owner,
        lease_token = excluded.lease_token,
        heartbeat_at = excluded.heartbeat_at,
        current_step_id = coalesce(excluded.current_step_id, public.${T}.current_step_id),
        current_stage = coalesce(excluded.current_stage, public.${T}.current_stage),
        progress_marker = coalesce(excluded.progress_marker, public.${T}.progress_marker),
        last_external_action_id = coalesce(excluded.last_external_action_id, public.${T}.last_external_action_id),
        last_artifact_id = coalesce(excluded.last_artifact_id, public.${T}.last_artifact_id),
        worker_instance_id = coalesce(excluded.worker_instance_id, public.${T}.worker_instance_id),
        updated_at = excluded.updated_at
      returning *`,
      [
        input.runId,
        input.jobId ?? null,
        input.leaseOwner,
        input.leaseToken ?? null,
        heartbeatAt,
        input.currentStepId ?? null,
        input.currentStage ?? null,
        input.progressMarker ?? null,
        input.lastExternalActionId ?? null,
        input.lastArtifactId ?? null,
        input.workerInstanceId ?? null,
        now,
      ],
    );
    return mapHeartbeat(res.rows[0] as Record<string, unknown>);
  }

  /**
   * Fenced heartbeat write — requires matching lease_token on job row via caller,
   * and stores progress fields on the heartbeat SoT table.
   */
  async saveFenced(
    input: SaveHeartbeatInput & { expectedLeaseToken: string },
  ): Promise<DurableHeartbeatRecord | null> {
    if (
      input.leaseToken &&
      input.leaseToken !== input.expectedLeaseToken
    ) {
      return null;
    }
    return this.save({ ...input, leaseToken: input.expectedLeaseToken });
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

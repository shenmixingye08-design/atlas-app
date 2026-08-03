import "server-only";

import { randomUUID } from "node:crypto";

import type { DurableSotPool } from "../db";
import { isUniqueViolation, uniqueConstraintName } from "../db";
import { mapLease } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type { AcquireLeaseInput, DurableLeaseRecord } from "../types";
import { DurableSotUniqueViolationError } from "../types";

const T = DURABLE_SOT_TABLES.leases;

type Queryable = Pick<DurableSotPool, "query">;

export class DurableLeasesRepository {
  constructor(private readonly pool: Queryable & { connect?: DurableSotPool["connect"] }) {}

  /**
   * Acquire lease for a run with leaseToken + leaseVersion.
   * Atomic via BEGIN + FOR UPDATE. Expired or same-owner leases can be replaced.
   */
  async acquire(
    input: AcquireLeaseInput,
  ): Promise<{ lease: DurableLeaseRecord; acquired: boolean }> {
    const now = new Date().toISOString();
    const token = input.leaseToken ?? randomUUID();
    const connect = this.pool.connect?.bind(this.pool);
    if (!connect) {
      // PoolClient path — operate without nested connect.
      return this.acquireOnClient(this.pool, input, token, now);
    }
    const client = await connect();
    try {
      return await this.acquireOnClient(client, input, token, now);
    } finally {
      client.release();
    }
  }

  private async acquireOnClient(
    client: Queryable,
    input: AcquireLeaseInput,
    token: string,
    now: string,
  ): Promise<{ lease: DurableLeaseRecord; acquired: boolean }> {
    try {
      await client.query("begin");
      const existing = await client.query(
        `select * from public.${T} where run_id = $1 for update`,
        [input.runId],
      );
      if (existing.rowCount && existing.rows[0]) {
        const row = existing.rows[0] as Record<string, unknown>;
        const expires = new Date(String(row.lease_expires_at)).getTime();
        const owner = String(row.lease_owner);
        const released = row.released_at != null;
        if (!released && expires > Date.now() && owner !== input.leaseOwner) {
          await client.query("commit");
          return { lease: mapLease(row), acquired: false };
        }
        const updated = await client.query(
          `update public.${T} set
            lease_owner = $2,
            lease_expires_at = $3,
            job_id = coalesce($4, job_id),
            lease_token = $5,
            lease_version = coalesce(lease_version, 0) + 1,
            heartbeat_at = $6,
            worker_instance_id = $7,
            worker_started_at = coalesce($8, worker_started_at, $6),
            released_at = null,
            release_reason = null,
            updated_at = $6
           where run_id = $1
           returning *`,
          [
            input.runId,
            input.leaseOwner,
            input.leaseExpiresAt,
            input.jobId ?? null,
            token,
            now,
            input.workerInstanceId ?? null,
            input.workerStartedAt ?? now,
          ],
        );
        await client.query("commit");
        return {
          lease: mapLease(updated.rows[0] as Record<string, unknown>),
          acquired: true,
        };
      }

      const inserted = await client.query(
        `insert into public.${T} (
          run_id, job_id, lease_owner, lease_expires_at,
          lease_token, lease_version, heartbeat_at,
          worker_instance_id, worker_started_at,
          acquired_at, updated_at, created_at
        ) values ($1,$2,$3,$4,$5,1,$6,$7,$8,$6,$6,$6)
        returning *`,
        [
          input.runId,
          input.jobId ?? null,
          input.leaseOwner,
          input.leaseExpiresAt,
          token,
          now,
          input.workerInstanceId ?? null,
          input.workerStartedAt ?? now,
        ],
      );
      await client.query("commit");
      return {
        lease: mapLease(inserted.rows[0] as Record<string, unknown>),
        acquired: true,
      };
    } catch (error) {
      try {
        await client.query("rollback");
      } catch {
        /* ignore */
      }
      if (isUniqueViolation(error)) {
        throw new DurableSotUniqueViolationError(
          "lease unique violation",
          uniqueConstraintName(error),
        );
      }
      throw error;
    }
  }

  async release(
    runId: string,
    leaseOwner: string,
    input?: { leaseToken?: string; releaseReason?: string },
  ): Promise<boolean> {
    const res = await this.pool.query(
      `update public.${T} set
         released_at = now(),
         release_reason = $3,
         updated_at = now()
       where run_id = $1
         and lease_owner = $2
         and ($4::text is null or lease_token = $4)
         and released_at is null`,
      [
        runId,
        leaseOwner,
        input?.releaseReason ?? "released",
        input?.leaseToken ?? null,
      ],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async get(runId: string): Promise<DurableLeaseRecord | null> {
    const res = await this.pool.query(
      `select * from public.${T} where run_id = $1 limit 1`,
      [runId],
    );
    if (!res.rowCount) return null;
    return mapLease(res.rows[0] as Record<string, unknown>);
  }
}

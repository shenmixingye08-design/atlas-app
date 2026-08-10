import "server-only";

import type { DurableSotPool } from "../db";
import { isUniqueViolation, uniqueConstraintName } from "../db";
import { mapLease } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type { AcquireLeaseInput, DurableLeaseRecord } from "../types";
import { DurableSotUniqueViolationError } from "../types";

const T = DURABLE_SOT_TABLES.leases;

export class DurableLeasesRepository {
  constructor(private readonly pool: DurableSotPool) {}

  /**
   * Acquire lease for a run. If an unexpired lease exists for another owner,
   * returns acquired=false. Same owner renews. Expired leases are replaced.
   */
  async acquire(
    input: AcquireLeaseInput,
  ): Promise<{ lease: DurableLeaseRecord; acquired: boolean }> {
    const now = new Date().toISOString();
    const client = await this.pool.connect();
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
        if (expires > Date.now() && owner !== input.leaseOwner) {
          await client.query("commit");
          return { lease: mapLease(row), acquired: false };
        }
        const updated = await client.query(
          `update public.${T} set
            lease_owner = $2,
            lease_expires_at = $3,
            job_id = coalesce($4, job_id),
            updated_at = $5
           where run_id = $1
           returning *`,
          [
            input.runId,
            input.leaseOwner,
            input.leaseExpiresAt,
            input.jobId ?? null,
            now,
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
          acquired_at, updated_at, created_at
        ) values ($1,$2,$3,$4,$5,$5,$5)
        returning *`,
        [
          input.runId,
          input.jobId ?? null,
          input.leaseOwner,
          input.leaseExpiresAt,
          now,
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
    } finally {
      client.release();
    }
  }

  async release(runId: string, leaseOwner: string): Promise<boolean> {
    const res = await this.pool.query(
      `delete from public.${T}
       where run_id = $1 and lease_owner = $2`,
      [runId, leaseOwner],
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

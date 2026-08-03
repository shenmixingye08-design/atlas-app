import "server-only";

import { randomUUID } from "node:crypto";

import type { DurableSotPool } from "../db";
import { mapJobRecovery } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type {
  CreateJobRecoveryInput,
  DurableJobRecoveryRecord,
  UpdateJobRecoveryInput,
} from "../types";

const T = DURABLE_SOT_TABLES.jobRecoveries;

type Queryable = Pick<DurableSotPool, "query">;

export class DurableJobRecoveriesRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: CreateJobRecoveryInput): Promise<DurableJobRecoveryRecord> {
    const recoveryId = input.recoveryId ?? randomUUID();
    const now = new Date().toISOString();
    const res = await this.db.query(
      `insert into public.${T} (
        recovery_id, job_id, run_id, detected_at, detected_reason,
        previous_lease_owner, previous_lease_token, recovery_worker_id,
        recovery_attempt, recovery_from_step_id, recovery_strategy,
        recovery_status, diagnostic_id, assessment, created_at, updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$15
      ) returning *`,
      [
        recoveryId,
        input.jobId,
        input.runId,
        now,
        input.detectedReason,
        input.previousLeaseOwner ?? null,
        input.previousLeaseToken ?? null,
        input.recoveryWorkerId ?? null,
        input.recoveryAttempt ?? 1,
        input.recoveryFromStepId ?? null,
        input.recoveryStrategy ?? null,
        input.recoveryStatus ?? "detected",
        input.diagnosticId ?? null,
        JSON.stringify(input.assessment ?? {}),
        now,
      ],
    );
    return mapJobRecovery(res.rows[0] as Record<string, unknown>);
  }

  async update(
    recoveryId: string,
    patch: UpdateJobRecoveryInput,
  ): Promise<DurableJobRecoveryRecord | null> {
    const res = await this.db.query(
      `update public.${T} set
        recovery_status = coalesce($2, recovery_status),
        recovery_worker_id = coalesce($3, recovery_worker_id),
        recovery_from_step_id = coalesce($4, recovery_from_step_id),
        recovery_strategy = coalesce($5, recovery_strategy),
        recovered_at = coalesce($6, recovered_at),
        failed_at = coalesce($7, failed_at),
        error_code = coalesce($8, error_code),
        diagnostic_id = coalesce($9, diagnostic_id),
        assessment = coalesce($10::jsonb, assessment),
        updated_at = $11
       where recovery_id = $1
       returning *`,
      [
        recoveryId,
        patch.recoveryStatus ?? null,
        patch.recoveryWorkerId === undefined ? null : patch.recoveryWorkerId,
        patch.recoveryFromStepId === undefined
          ? null
          : patch.recoveryFromStepId,
        patch.recoveryStrategy === undefined ? null : patch.recoveryStrategy,
        patch.recoveredAt === undefined ? null : patch.recoveredAt,
        patch.failedAt === undefined ? null : patch.failedAt,
        patch.errorCode === undefined ? null : patch.errorCode,
        patch.diagnosticId === undefined ? null : patch.diagnosticId,
        patch.assessment === undefined
          ? null
          : JSON.stringify(patch.assessment),
        new Date().toISOString(),
      ],
    );
    if (!res.rowCount) return null;
    return mapJobRecovery(res.rows[0] as Record<string, unknown>);
  }

  async get(recoveryId: string): Promise<DurableJobRecoveryRecord | null> {
    const res = await this.db.query(
      `select * from public.${T} where recovery_id = $1 limit 1`,
      [recoveryId],
    );
    if (!res.rowCount) return null;
    return mapJobRecovery(res.rows[0] as Record<string, unknown>);
  }

  async latestForJob(
    jobId: string,
  ): Promise<DurableJobRecoveryRecord | null> {
    const res = await this.db.query(
      `select * from public.${T}
       where job_id = $1
       order by detected_at desc
       limit 1`,
      [jobId],
    );
    if (!res.rowCount) return null;
    return mapJobRecovery(res.rows[0] as Record<string, unknown>);
  }
}

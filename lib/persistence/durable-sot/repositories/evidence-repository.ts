import "server-only";

import { randomUUID } from "node:crypto";

import type { DurableSotPool } from "../db";
import { isUniqueViolation, uniqueConstraintName } from "../db";
import { mapEvidence } from "../mappers";
import { DURABLE_SOT_TABLES } from "../schema";
import type { AppendEvidenceInput, DurableEvidenceRecord } from "../types";
import { DurableSotUniqueViolationError } from "../types";

const T = DURABLE_SOT_TABLES.evidence;

export class DurableEvidenceRepository {
  constructor(private readonly pool: DurableSotPool) {}

  async append(input: AppendEvidenceInput): Promise<DurableEvidenceRecord> {
    const evidenceId = input.evidenceId ?? randomUUID();
    const now = new Date().toISOString();
    try {
      const res = await this.pool.query(
        `insert into public.${T} (
          evidence_id, run_id, job_id, evidence_kind, evidence_fingerprint,
          payload, created_at, updated_at
        ) values (
          $1,$2,$3,$4,$5,$6::jsonb,$7,$7
        ) returning *`,
        [
          evidenceId,
          input.runId,
          input.jobId ?? null,
          input.evidenceKind,
          input.evidenceFingerprint,
          JSON.stringify(input.payload ?? {}),
          now,
        ],
      );
      return mapEvidence(res.rows[0] as Record<string, unknown>);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DurableSotUniqueViolationError(
          "evidence unique violation",
          uniqueConstraintName(error),
        );
      }
      throw error;
    }
  }

  async list(runId: string): Promise<DurableEvidenceRecord[]> {
    const res = await this.pool.query(
      `select * from public.${T}
       where run_id = $1
       order by created_at asc`,
      [runId],
    );
    return res.rows.map((row) => mapEvidence(row as Record<string, unknown>));
  }
}

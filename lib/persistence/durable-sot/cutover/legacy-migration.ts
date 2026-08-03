/**
 * Legacy atlas_work_queue_* → atlas_durable_* migration.
 * Dry-run / apply / rollback-safe batch. Never promotes incomplete jobs to completed.
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { logDurableSot } from "./observability";

export type LegacyMigrationCounts = {
  beforeJobs: number;
  beforeSteps: number;
  afterJobs: number;
  afterRuns: number;
  afterSteps: number;
  success: number;
  skipped: number;
  conflicts: number;
  failed: number;
  orphans: number;
  duplicates: number;
  checksumBefore: string;
  checksumAfter: string;
};

export type LegacyMigrationResult = {
  dryRun: boolean;
  counts: LegacyMigrationCounts;
  statusMapping: Record<string, string>;
  manualReviewJobIds: string[];
};

const STATUS_MAP: Record<string, string> = {
  queued: "queued",
  leased: "leased",
  running: "running",
  retry_scheduled: "retry",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
  dead_letter: "dead_letter",
  waiting_approval: "waiting_approval",
  waiting_input: "waiting_input",
  partially_completed: "partially_completed",
};

function checksumRows(rows: Array<{ job_id: string; updated_at: string }>): string {
  const payload = rows
    .map((r) => `${r.job_id}:${r.updated_at}`)
    .sort()
    .join("|");
  let h = 0;
  for (let i = 0; i < payload.length; i += 1) {
    h = (h * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return `cs_${h.toString(16)}`;
}

async function tableExists(pool: Pool, name: string): Promise<boolean> {
  const res = await pool.query(
    `select 1 from pg_tables where schemaname = 'public' and tablename = $1`,
    [name],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function migrateLegacyWorkQueueToDurable(
  pool: Pool,
  options?: { dryRun?: boolean; batchSize?: number },
): Promise<LegacyMigrationResult> {
  const dryRun = options?.dryRun ?? true;
  const diagnosticId = `mig_${randomUUID().slice(0, 8)}`;
  logDurableSot({
    event: "MIGRATION_STARTED",
    domain: "legacy_work_queue",
    repository: "migrateLegacyWorkQueueToDurable",
    diagnosticId,
    detail: dryRun ? "dry_run" : "apply",
  });

  const empty: LegacyMigrationResult = {
    dryRun,
    counts: {
      beforeJobs: 0,
      beforeSteps: 0,
      afterJobs: 0,
      afterRuns: 0,
      afterSteps: 0,
      success: 0,
      skipped: 0,
      conflicts: 0,
      failed: 0,
      orphans: 0,
      duplicates: 0,
      checksumBefore: "cs_0",
      checksumAfter: "cs_0",
    },
    statusMapping: STATUS_MAP,
    manualReviewJobIds: [],
  };

  try {
    const hasLegacy = await tableExists(pool, "atlas_work_queue_jobs");
    if (!hasLegacy) {
      logDurableSot({
        event: "MIGRATION_COMPLETED",
        domain: "legacy_work_queue",
        status: "empty_no_legacy_table",
        diagnosticId,
      });
      return empty;
    }

    const jobsRes = await pool.query(
      `select job_id::text, status, updated_at::text, owner_id, run_id::text,
              automation_id, occurrence_key, schedule_id, priority, available_at,
              scheduled_at, started_at, completed_at, attempt, max_attempts,
              retry_at, error_code, diagnostic_id, idempotency_key, payload,
              result_summary, first_error, last_error, created_at, lease_owner,
              lease_expires_at, heartbeat_at
       from public.atlas_work_queue_jobs
       order by created_at asc`,
    );
    const stepsRes = await tableExists(pool, "atlas_work_queue_steps")
      ? await pool.query(
          `select step_id, job_id::text, step_index, step_type, status, attempt,
                  input_bindings, output_bindings, artifact_ids, error_code,
                  error_message, started_at, completed_at, idempotency_key,
                  created_at, updated_at
           from public.atlas_work_queue_steps`,
        )
      : { rows: [] as Record<string, unknown>[] };

    const checksumBefore = checksumRows(
      jobsRes.rows.map((r) => ({
        job_id: String(r.job_id),
        updated_at: String(r.updated_at),
      })),
    );

    let success = 0;
    let skipped = 0;
    const conflicts = 0;
    let failed = 0;
    let duplicates = 0;
    let orphans = 0;
    const manualReviewJobIds: string[] = [];

    if (!dryRun) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const row of jobsRes.rows) {
          const jobId = String(row.job_id);
          const idem = String(row.idempotency_key);
          const existing = await client.query(
            `select job_id from public.atlas_durable_jobs
             where job_id = $1 or idempotency_key = $2 limit 1`,
            [jobId, idem],
          );
          if (existing.rowCount) {
            duplicates += 1;
            skipped += 1;
            continue;
          }

          let status = STATUS_MAP[String(row.status)] ?? "failed";
          // Incomplete running → do NOT mark completed; fail-safe review.
          if (status === "running" || status === "leased") {
            status = "retry";
            manualReviewJobIds.push(jobId);
          }

          const runIdRaw = String(row.run_id ?? "");
          const runId =
            /^[0-9a-f-]{36}$/i.test(runIdRaw) ? runIdRaw : randomUUID();

          try {
            await client.query(
              `insert into public.atlas_durable_runs (
                 run_id, owner_id, automation_id, job_id, status, trigger_type,
                 payload, idempotency_key, created_at, updated_at, started_at, completed_at
               ) values (
                 $1,$2,$3,$4,$5,'migration',$6::jsonb,$7,$8,$9,$10,$11
               )
               on conflict (run_id) do nothing`,
              [
                runId,
                String(row.owner_id),
                row.automation_id,
                jobId,
                status === "completed" ? "succeeded" : "queued",
                JSON.stringify(row.payload ?? {}),
                `run:${idem}`,
                row.created_at,
                row.updated_at,
                row.started_at,
                row.completed_at,
              ],
            );

            await client.query(
              `insert into public.atlas_durable_jobs (
                 job_id, run_id, owner_id, automation_id, occurrence_key, schedule_id,
                 status, priority, available_at, scheduled_at, started_at, completed_at,
                 lease_owner, lease_expires_at, heartbeat_at, attempt, max_attempts,
                 retry_at, error_code, error_message, diagnostic_id, idempotency_key,
                 payload, result_summary, first_error, last_error, created_at, updated_at,
                 lease_token, lease_version
               ) values (
                 $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
                 $23::jsonb,$24,$25,$26,$27,$28,null,0
               )`,
              [
                jobId,
                runId,
                String(row.owner_id),
                row.automation_id,
                String(row.occurrence_key),
                row.schedule_id,
                status,
                Number(row.priority ?? 0),
                row.available_at,
                row.scheduled_at,
                row.started_at,
                row.completed_at,
                null, // clear lease on migrate
                null,
                null,
                Number(row.attempt ?? 0),
                Number(row.max_attempts ?? 5),
                row.retry_at,
                row.error_code,
                row.last_error,
                row.diagnostic_id,
                idem,
                JSON.stringify(row.payload ?? {}),
                row.result_summary,
                row.first_error,
                row.last_error,
                row.created_at,
                row.updated_at,
              ],
            );
            success += 1;
          } catch {
            failed += 1;
          }
        }

        for (const step of stepsRes.rows) {
          const jobId = String(step.job_id);
          const job = await client.query(
            `select run_id from public.atlas_durable_jobs where job_id = $1`,
            [jobId],
          );
          if (!job.rowCount) {
            orphans += 1;
            continue;
          }
          const runId = String(job.rows[0]!.run_id);
          const stepStatus =
            String(step.status) === "completed" ? "succeeded" : String(step.status);
          await client.query(
            `insert into public.atlas_durable_steps (
               run_id, step_id, job_id, step_index, step_type, status, attempt,
               input_bindings, output_bindings, error_code, error_message,
               started_at, completed_at, created_at, updated_at
             ) values (
               $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15
             )
             on conflict (run_id, step_id) do nothing`,
            [
              runId,
              String(step.step_id),
              jobId,
              Number(step.step_index),
              String(step.step_type),
              stepStatus,
              Number(step.attempt ?? 0),
              JSON.stringify(step.input_bindings ?? {}),
              JSON.stringify({
                ...(typeof step.output_bindings === "object" &&
                step.output_bindings
                  ? (step.output_bindings as object)
                  : {}),
                __artifactIds: step.artifact_ids ?? [],
                __idempotencyKey: step.idempotency_key,
              }),
              step.error_code,
              step.error_message,
              step.started_at,
              step.completed_at,
              step.created_at,
              step.updated_at,
            ],
          );
        }

        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        logDurableSot({
          event: "MIGRATION_FAILED",
          domain: "legacy_work_queue",
          diagnosticId,
          errorCode: "MIGRATION_TX_FAILED",
          detail: error instanceof Error ? error.message : "unknown",
        });
        throw error;
      } finally {
        client.release();
      }
    } else {
      // Dry-run: count only
      success = jobsRes.rows.length;
      for (const row of jobsRes.rows) {
        if (
          String(row.status) === "running" ||
          String(row.status) === "leased"
        ) {
          manualReviewJobIds.push(String(row.job_id));
        }
      }
    }

    const afterJobs = await pool.query(
      `select count(*)::int as c from public.atlas_durable_jobs`,
    );
    const afterRuns = await pool.query(
      `select count(*)::int as c from public.atlas_durable_runs`,
    );
    const afterSteps = await pool.query(
      `select count(*)::int as c from public.atlas_durable_steps`,
    );
    const afterList = await pool.query(
      `select job_id::text, updated_at::text from public.atlas_durable_jobs`,
    );

    const result: LegacyMigrationResult = {
      dryRun,
      counts: {
        beforeJobs: jobsRes.rows.length,
        beforeSteps: stepsRes.rows.length,
        afterJobs: Number(afterJobs.rows[0]?.c ?? 0),
        afterRuns: Number(afterRuns.rows[0]?.c ?? 0),
        afterSteps: Number(afterSteps.rows[0]?.c ?? 0),
        success: dryRun ? jobsRes.rows.length : success,
        skipped,
        conflicts,
        failed,
        orphans,
        duplicates,
        checksumBefore,
        checksumAfter: checksumRows(
          afterList.rows.map((r) => ({
            job_id: String(r.job_id),
            updated_at: String(r.updated_at),
          })),
        ),
      },
      statusMapping: STATUS_MAP,
      manualReviewJobIds,
    };

    logDurableSot({
      event: "MIGRATION_COMPLETED",
      domain: "legacy_work_queue",
      diagnosticId,
      status: dryRun ? "dry_run_ok" : "applied",
      detail: `success=${result.counts.success};dup=${duplicates};failed=${failed}`,
    });
    return result;
  } catch (error) {
    logDurableSot({
      event: "MIGRATION_FAILED",
      domain: "legacy_work_queue",
      diagnosticId,
      errorCode: "MIGRATION_FAILED",
    });
    throw error;
  }
}

/** Rollback helper: delete migrated rows by idempotency prefix (ops only). */
export async function rollbackLegacyMigrationBatch(
  pool: Pool,
  jobIds: string[],
): Promise<number> {
  if (jobIds.length === 0) return 0;
  const res = await pool.query(
    `delete from public.atlas_durable_jobs where job_id = any($1::uuid[])`,
    [jobIds],
  );
  return res.rowCount ?? 0;
}

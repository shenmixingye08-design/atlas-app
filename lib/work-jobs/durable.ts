import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import { bumpPersistenceCounter } from "@/lib/persistence/call-counters";

import { logProductionApiError } from "@/lib/reliability/production-error-log";

import type { WorkJobRecord } from "./store";

const DOMAIN_KEY = "atlasWorkJobs";
const MAX_JOBS = 30;

type JobsPayload = { jobs: WorkJobRecord[] };

export type WorkJobPersistResult = "supabase" | "failed";

/** @deprecated Always true on Vercel — kept for tests. */
export function isVercelEphemeralFs(): boolean {
  return (
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.AWS_LAMBDA_FUNCTION_NAME != null ||
    process.env.ATLAS_FORCE_EPHEMERAL_FS === "1"
  );
}

function slimJob(job: WorkJobRecord): WorkJobRecord {
  return {
    ...job,
    result: job.result
      ? {
          ...job.result,
          finalResponse: (job.result.finalResponse ?? "").slice(0, 12_000),
        }
      : null,
  };
}

/**
 * Persist job for cold-start / cross-instance recovery.
 * Supabase only — no local disk, no Clerk payloads.
 */
export async function persistWorkJob(
  job: WorkJobRecord,
): Promise<WorkJobPersistResult> {
  const slim = slimJob(job);
  try {
    const existing =
      (await loadDurableDomain<JobsPayload>(job.userId, DOMAIN_KEY))?.jobs ?? [];
    const next = [slim, ...existing.filter((j) => j.id !== slim.id)].slice(
      0,
      MAX_JOBS,
    );
    const result = await persistDurableDomain(
      job.userId,
      DOMAIN_KEY,
      { jobs: next },
      {
        forceSupabase: true,
        compact: (payload) => payload,
      },
    );
    if (result !== "supabase") {
      logProductionApiError({
        endpoint: "work-jobs/persist",
        code: "work_job_persist_failed",
        diagnosticId: `p5_work_job_${job.id}`,
        failureStage: "durable_persist",
        subsystem: "work_jobs",
        userId: job.userId,
        message: String(result),
      });
      return "failed";
    }
    bumpPersistenceCounter("workJobPersist");
    return "supabase";
  } catch (error) {
    logProductionApiError({
      endpoint: "work-jobs/persist",
      code: "work_job_persist_threw",
      diagnosticId: `p5_work_job_${job.id}`,
      failureStage: "durable_persist",
      subsystem: "work_jobs",
      userId: job.userId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return "failed";
  }
}

/** Disk lookup removed — always null (Supabase via loadWorkJobFromDurable). */
export const loadWorkJobFromDisk: (
  id: string,
  userId: string,
) => WorkJobRecord | null = () => {
  return null;
};

export async function loadWorkJobFromDurable(
  id: string,
  userId: string,
): Promise<WorkJobRecord | null> {
  try {
    const payload = await loadDurableDomain<JobsPayload>(userId, DOMAIN_KEY);
    const job = payload?.jobs?.find((j) => j.id === id) ?? null;
    if (!job || job.userId !== userId) return null;
    return job;
  } catch {
    return null;
  }
}

export type WorkJobDurableLookup =
  | { status: "found"; job: WorkJobRecord }
  | { status: "missing" }
  | { status: "unavailable"; error: string };

export async function loadWorkJobByIdempotencyKeyFromDurable(
  userId: string,
  idempotencyKey: string,
): Promise<WorkJobDurableLookup> {
  const key = idempotencyKey.trim();
  if (!userId.trim() || !key) return { status: "missing" };
  try {
    const payload = await loadDurableDomain<JobsPayload>(userId, DOMAIN_KEY);
    const job =
      payload?.jobs?.find(
        (row) => row.userId === userId && row.idempotencyKey === key,
      ) ?? null;
    if (job && job.userId === userId) return { status: "found", job };
    return { status: "missing" };
  } catch (error) {
    return {
      status: "unavailable",
      error: error instanceof Error ? error.message : "durable lookup failed",
    };
  }
}

import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import { bumpPersistenceCounter } from "@/lib/persistence/call-counters";

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
      console.error("[work-jobs] durable supabase persist failed", {
        jobId: job.id,
        userId: job.userId,
        result,
      });
      return "failed";
    }
    bumpPersistenceCounter("workJobPersist");
    return "supabase";
  } catch (error) {
    console.error("[work-jobs] durable supabase persist threw", {
      jobId: job.id,
      userId: job.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
}

/** Disk lookup removed — always null (Supabase via loadWorkJobFromDurable). */
export function loadWorkJobFromDisk(
  _id: string,
  _userId: string,
): WorkJobRecord | null {
  return null;
}

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

/** Load all durable work jobs for a user (newest first). */
export async function loadWorkJobsForUserFromDurable(
  userId: string,
): Promise<WorkJobRecord[]> {
  try {
    const payload = await loadDurableDomain<JobsPayload>(userId, DOMAIN_KEY);
    return (payload?.jobs ?? []).filter((j) => j.userId === userId);
  } catch {
    return [];
  }
}

/**
 * Resolve WorkJob by linked ids — never treat commanderRunId as jobId.
 * Looks at: job.id, metadata.jobId, metadata.commanderRunId, metadata.projectId,
 * result.commanderRunId.
 */
export async function findWorkJobByLinkedIds(input: {
  userId: string;
  workJobId?: string | null;
  commanderRunId?: string | null;
  projectId?: string | null;
  requestId?: string | null;
}): Promise<WorkJobRecord | null> {
  const jobs = await loadWorkJobsForUserFromDurable(input.userId);
  const byId = input.workJobId
    ? jobs.find((j) => j.id === input.workJobId)
    : null;
  if (byId) return byId;

  const commanderRunId = input.commanderRunId?.trim() || null;
  const projectId = input.projectId?.trim() || null;
  const requestId = input.requestId?.trim() || null;

  for (const job of jobs) {
    const meta = job.metadata ?? {};
    const metaCommander =
      typeof meta.commanderRunId === "string" ? meta.commanderRunId : null;
    const metaProject =
      typeof meta.projectId === "string" ? meta.projectId : null;
    const resultCommander = job.result?.commanderRunId ?? null;
    if (commanderRunId && (metaCommander === commanderRunId || resultCommander === commanderRunId)) {
      return job;
    }
    if (projectId && metaProject === projectId) {
      return job;
    }
    // requestId on notifications is often commander run id — do NOT match job.id
    // unless explicitly equal (legacy rows that reused the same uuid).
    if (requestId && job.id === requestId) {
      return job;
    }
  }
  return null;
}

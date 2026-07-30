import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import {
  loadDurableDomain,
  persistDurableDomain,
  pruneOversizedClerkDurableDomains,
} from "@/lib/persistence/durable-domain";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import type { WorkJobRecord } from "./store";

const DOMAIN_KEY = "atlasWorkJobs";
const MAX_JOBS = 30;

type JobsPayload = { jobs: WorkJobRecord[] };

export type WorkJobPersistResult = "supabase" | "disk_dev" | "failed";

/** Vercel serverless local FS is ephemeral — never use it as a job DB. */
export function isVercelEphemeralFs(): boolean {
  return (
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.AWS_LAMBDA_FUNCTION_NAME != null
  );
}

function allowLocalDiskPersist(): boolean {
  // Production / Vercel: ban process.cwd()/.data (maps to /var/task/.data).
  if (isVercelEphemeralFs() || isAtlasProduction()) return false;
  return true;
}

function diskRoot(): string {
  // Dev-only helper under the repo. Never relied upon in Vercel.
  return join(process.cwd(), ".data", "work-jobs");
}

function pathFor(userId: string, id: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(diskRoot(), safeUser, `${id}.json`);
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

async function persistWorkJobToSupabase(job: WorkJobRecord): Promise<boolean> {
  const slim = slimJob(job);
  try {
    await pruneOversizedClerkDurableDomains(job.userId);
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
      return false;
    }
    return true;
  } catch (error) {
    console.error("[work-jobs] durable supabase persist threw", {
      jobId: job.id,
      userId: job.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Persist job for cold-start / cross-instance recovery.
 * Vercel / production: Supabase only (never /var/task/.data).
 * Local dev: Supabase + optional disk cache; disk failure alone is not success.
 */
export async function persistWorkJob(
  job: WorkJobRecord,
): Promise<WorkJobPersistResult> {
  const supabaseOk = await persistWorkJobToSupabase(job);
  if (!supabaseOk) {
    return "failed";
  }

  if (!allowLocalDiskPersist()) {
    return "supabase";
  }

  try {
    const slim = slimJob(job);
    const file = pathFor(job.userId, job.id);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(slim));
    return "disk_dev";
  } catch (error) {
    // Dev disk is optional cache; Supabase already succeeded.
    console.warn("[work-jobs] local disk cache write skipped", error);
    return "supabase";
  }
}

export function loadWorkJobFromDisk(
  id: string,
  userId: string,
): WorkJobRecord | null {
  if (!allowLocalDiskPersist()) return null;
  try {
    const file = pathFor(userId, id);
    if (!existsSync(file)) return null;
    const parsed = JSON.parse(readFileSync(file, "utf8")) as WorkJobRecord;
    if (parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
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

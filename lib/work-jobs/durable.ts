import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";
import { bumpPersistenceCounter } from "@/lib/persistence/call-counters";
import { allowProcessCwdDataDir } from "@/lib/runtime/ephemeral-fs";

import type { WorkJobRecord } from "./store";

const DOMAIN_KEY = "atlasWorkJobs";
const MAX_JOBS = 30;

type JobsPayload = { jobs: WorkJobRecord[] };

export type WorkJobPersistResult = "supabase" | "disk_dev" | "failed";

export function isVercelEphemeralFs(): boolean {
  return !allowProcessCwdDataDir();
}

function allowLocalDiskPersist(): boolean {
  return allowProcessCwdDataDir();
}

function diskRoot(): string {
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
    bumpPersistenceCounter("workJobPersist");
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
 * Never prunes Clerk on every save (that caused 429).
 */
export async function persistWorkJob(
  job: WorkJobRecord,
): Promise<WorkJobPersistResult> {
  const supabaseOk = await persistWorkJobToSupabase(job);
  if (!supabaseOk) {
    return "failed";
  }

  if (!allowLocalDiskPersist()) {
    bumpPersistenceCounter("processCwdDataDirBlocked");
    return "supabase";
  }

  bumpPersistenceCounter("processCwdDataDirAttempts");
  try {
    const slim = slimJob(job);
    const file = pathFor(job.userId, job.id);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(slim));
    return "disk_dev";
  } catch (error) {
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

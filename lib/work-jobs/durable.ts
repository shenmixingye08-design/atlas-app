import "server-only";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import type { WorkJobRecord } from "./store";

const ROOT = join(process.cwd(), ".data", "work-jobs");
const DOMAIN_KEY = "atlasWorkJobs";
const MAX_JOBS = 30;

type JobsPayload = { jobs: WorkJobRecord[] };

function pathFor(userId: string, id: string): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(ROOT, safeUser, `${id}.json`);
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

/** Persist job for cold-start / cross-instance recovery (disk + durable domain). */
export function persistWorkJob(job: WorkJobRecord): void {
  const slim = slimJob(job);
  try {
    const file = pathFor(job.userId, job.id);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, JSON.stringify(slim));
  } catch (error) {
    console.warn("[work-jobs] disk persist failed", error);
  }

  void (async () => {
    try {
      const existing =
        (await loadDurableDomain<JobsPayload>(job.userId, DOMAIN_KEY))?.jobs ??
        [];
      const next = [
        slim,
        ...existing.filter((j) => j.id !== slim.id),
      ].slice(0, MAX_JOBS);
      await persistDurableDomain(
        job.userId,
        DOMAIN_KEY,
        { jobs: next },
        {
          forceSupabase: true,
          compact: (payload) => ({
            jobs: payload.jobs.slice(0, 10).map((j) => ({
              ...j,
              result: j.result
                ? {
                    ...j.result,
                    finalResponse: (j.result.finalResponse ?? "").slice(0, 2_000),
                  }
                : null,
            })),
          }),
        },
      );
    } catch (error) {
      console.warn("[work-jobs] durable domain persist failed", error);
    }
  })();
}

export function loadWorkJobFromDisk(
  id: string,
  userId: string,
): WorkJobRecord | null {
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

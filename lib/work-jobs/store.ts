import "server-only";

import type { OrchestrationResult } from "@/lib/orchestration/types";

import {
  loadWorkJobFromDisk,
  loadWorkJobFromDurable,
  persistWorkJob,
} from "./durable";

export type WorkJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "awaiting_confirmation";

export type WorkJobRecord = {
  id: string;
  userId: string;
  assignment: string;
  /** Stable key — same job must execute once. */
  idempotencyKey: string;
  status: WorkJobStatus;
  attemptCount: number;
  maxAttempts: number;
  error: string | null;
  result: OrchestrationResult | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type Bucket = Map<string, WorkJobRecord>;

function getBucket(): Bucket {
  const g = globalThis as typeof globalThis & { __atlasWorkJobs?: Bucket };
  if (!g.__atlasWorkJobs) g.__atlasWorkJobs = new Map();
  return g.__atlasWorkJobs;
}

export function saveWorkJob(job: WorkJobRecord): WorkJobRecord {
  getBucket().set(job.id, job);
  persistWorkJob(job);
  return job;
}

export function getWorkJob(id: string, userId: string): WorkJobRecord | null {
  const job = getBucket().get(id) ?? null;
  if (job && job.userId === userId) return job;
  const fromDisk = loadWorkJobFromDisk(id, userId);
  if (fromDisk) {
    getBucket().set(fromDisk.id, fromDisk);
    return fromDisk;
  }
  return null;
}

/** Async lookup including Clerk/Supabase durable domain (cross-instance). */
export async function getWorkJobDurable(
  id: string,
  userId: string,
): Promise<WorkJobRecord | null> {
  const local = getWorkJob(id, userId);
  if (local) return local;
  const remote = await loadWorkJobFromDurable(id, userId);
  if (remote) {
    getBucket().set(remote.id, remote);
    return remote;
  }
  return null;
}

export function listWorkJobsForUser(userId: string): WorkJobRecord[] {
  return [...getBucket().values()]
    .filter((j) => j.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function findWorkJobByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): WorkJobRecord | null {
  for (const job of getBucket().values()) {
    if (job.userId === userId && job.idempotencyKey === idempotencyKey) {
      return job;
    }
  }
  return null;
}

/** Build minute-bucket idempotency key to prevent double-submit of the same request. */
export function buildWorkJobIdempotencyKey(input: {
  userId: string;
  assignment: string;
  clientKey?: string | null;
  nowMs?: number;
}): string {
  if (input.clientKey?.trim()) {
    return `work:${input.userId}:client:${input.clientKey.trim()}`;
  }
  const minuteBucket = Math.floor((input.nowMs ?? Date.now()) / 60_000);
  const normalized = input.assignment.trim().replace(/\s+/g, " ").slice(0, 500);
  return `work:${input.userId}:${minuteBucket}:${normalized}`;
}

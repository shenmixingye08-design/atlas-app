import "server-only";

import type { OrchestrationResult } from "@/lib/orchestration/types";
import type { CommanderVisionGate } from "@/lib/commander/types";

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
  /**
   * Request metadata (attachmentIds, documentExtracts, vision flags, etc.).
   * Never trust client userId — always overwrite from Clerk on write.
   */
  metadata: Readonly<Record<string, unknown>>;
  status: WorkJobStatus;
  attemptCount: number;
  maxAttempts: number;
  error: string | null;
  /** Vision failure detail when image pipeline blocked the job. */
  visionGate: CommanderVisionGate | null;
  result: OrchestrationResult | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Last durable persist backend. */
  durablePersist?: "supabase" | null;
};

type Bucket = Map<string, WorkJobRecord>;

function getBucket(): Bucket {
  const g = globalThis as typeof globalThis & { __atlasWorkJobs?: Bucket };
  if (!g.__atlasWorkJobs) g.__atlasWorkJobs = new Map();
  return g.__atlasWorkJobs;
}

function normalizeWorkJob(job: WorkJobRecord): WorkJobRecord {
  return {
    ...job,
    metadata: job.metadata && typeof job.metadata === "object" ? job.metadata : {},
    visionGate: job.visionGate ?? null,
  };
}

/**
 * Save job to memory and durable Supabase.
 * Throws if durable persist fails — callers must not treat as completed.
 */
export async function saveWorkJob(job: WorkJobRecord): Promise<WorkJobRecord> {
  const normalized = normalizeWorkJob(job);
  getBucket().set(normalized.id, normalized);
  const persistResult = await persistWorkJob(normalized);
  if (persistResult === "failed") {
    const err = new Error("work_job_durable_persist_failed");
    console.error("[work-jobs] saveWorkJob durable persist failed", {
      jobId: normalized.id,
      status: normalized.status,
    });
    throw err;
  }
  const withPersist: WorkJobRecord = {
    ...normalized,
    durablePersist: "supabase",
  };
  getBucket().set(withPersist.id, withPersist);
  return withPersist;
}

/**
 * In-memory heartbeat only — never durable-persists.
 * Heartbeat durable writes caused Clerk/Supabase spam and 429s.
 */
export function touchWorkJob(job: WorkJobRecord): WorkJobRecord {
  const normalized = normalizeWorkJob(job);
  getBucket().set(normalized.id, normalized);
  return normalized;
}

export function getWorkJob(id: string, userId: string): WorkJobRecord | null {
  const job = getBucket().get(id) ?? null;
  if (job && job.userId === userId) return normalizeWorkJob(job);
  const fromDisk = loadWorkJobFromDisk(id, userId);
  if (fromDisk) {
    const normalized = normalizeWorkJob(fromDisk);
    getBucket().set(normalized.id, normalized);
    return normalized;
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

/** Memory first, then durable domain — same key must not create a second job. */
export async function findWorkJobByIdempotencyKeyDurable(
  userId: string,
  idempotencyKey: string,
): Promise<WorkJobRecord | null> {
  const local = findWorkJobByIdempotencyKey(userId, idempotencyKey);
  if (local) return local;
  const { loadWorkJobByIdempotencyKeyFromDurable } = await import("./durable");
  const remote = await loadWorkJobByIdempotencyKeyFromDurable(
    userId,
    idempotencyKey,
  );
  if (remote && remote.userId === userId) {
    getBucket().set(remote.id, remote);
    return remote;
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

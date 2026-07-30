import "server-only";

import type { OrchestrationResult } from "@/lib/orchestration/types";

import {
  loadWorkJobFromDisk,
  loadWorkJobFromDurable,
  persistWorkJob,
} from "./durable";
import {
  normalizeJobBlockReason,
  normalizeJobStatus,
  type CanonicalJobStatus,
  type JobBlockReason,
  type WorkJobErrorCode,
} from "./job-status";

/**
 * @deprecated Use CanonicalJobStatus. Kept as alias for gradual migration.
 */
export type WorkJobStatus = CanonicalJobStatus;

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
  /** Canonical status only (queued|processing|completed|failed|timed_out|cancelled). */
  status: CanonicalJobStatus;
  /**
   * Non-status pause while `status === "processing"`.
   * Replaces legacy status `awaiting_confirmation`.
   */
  blockReason: JobBlockReason;
  attemptCount: number;
  maxAttempts: number;
  /** User-safe Japanese message (never raw stack / secrets). */
  error: string | null;
  /** Internal error code for diagnostics / support. */
  errorCode: WorkJobErrorCode | null;
  /** Truncated internal detail — logs/support only. */
  internalError: string | null;
  result: OrchestrationResult | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
};

type Bucket = Map<string, WorkJobRecord>;

function getBucket(): Bucket {
  const g = globalThis as typeof globalThis & { __atlasWorkJobs?: Bucket };
  if (!g.__atlasWorkJobs) g.__atlasWorkJobs = new Map();
  return g.__atlasWorkJobs;
}

/**
 * Normalize legacy records (running / awaiting_confirmation / missing fields)
 * into the canonical shape. Safe for disk + durable domain payloads.
 */
export function normalizeWorkJob(
  job: WorkJobRecord | (Partial<WorkJobRecord> & {
    id: string;
    userId: string;
    status: string;
  }),
): WorkJobRecord {
  const status =
    normalizeJobStatus(job.status) ??
    ("failed" as CanonicalJobStatus);
  const blockReason = normalizeJobBlockReason(
    (job as { status?: string }).status,
    job.blockReason ?? null,
  );

  return {
    id: job.id,
    userId: job.userId,
    assignment: typeof job.assignment === "string" ? job.assignment : "",
    idempotencyKey:
      typeof job.idempotencyKey === "string" ? job.idempotencyKey : job.id,
    metadata:
      job.metadata && typeof job.metadata === "object" ? job.metadata : {},
    status,
    blockReason: status === "processing" ? blockReason : null,
    attemptCount:
      typeof job.attemptCount === "number" && Number.isFinite(job.attemptCount)
        ? job.attemptCount
        : 0,
    maxAttempts:
      typeof job.maxAttempts === "number" && Number.isFinite(job.maxAttempts)
        ? job.maxAttempts
        : 3,
    error: typeof job.error === "string" ? job.error : null,
    errorCode: (job.errorCode as WorkJobErrorCode | null | undefined) ?? null,
    internalError:
      typeof job.internalError === "string" ? job.internalError : null,
    result: (job.result as OrchestrationResult | null | undefined) ?? null,
    createdAt:
      typeof job.createdAt === "string"
        ? job.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof job.updatedAt === "string"
        ? job.updatedAt
        : new Date().toISOString(),
    startedAt: typeof job.startedAt === "string" ? job.startedAt : null,
    completedAt: typeof job.completedAt === "string" ? job.completedAt : null,
    failedAt: typeof job.failedAt === "string" ? job.failedAt : null,
  };
}

export function saveWorkJob(job: WorkJobRecord): WorkJobRecord {
  const normalized = normalizeWorkJob(job);
  getBucket().set(normalized.id, normalized);
  persistWorkJob(normalized);
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
    const normalized = normalizeWorkJob(remote);
    getBucket().set(normalized.id, normalized);
    return normalized;
  }
  return null;
}

export function listWorkJobsForUser(userId: string): WorkJobRecord[] {
  return [...getBucket().values()]
    .filter((j) => j.userId === userId)
    .map(normalizeWorkJob)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function findWorkJobByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): WorkJobRecord | null {
  for (const job of getBucket().values()) {
    if (job.userId === userId && job.idempotencyKey === idempotencyKey) {
      return normalizeWorkJob(job);
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

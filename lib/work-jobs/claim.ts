/**
 * Atomic work-job create identity.
 * Production SoT: unique (user_id, idempotency_key) INSERT / ON CONFLICT.
 * Never SELECT-then-INSERT. Process memory is not the uniqueness SoT.
 */

import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type { WorkJobRecord, WorkJobStatus } from "./store";

export const WORK_JOB_CLAIM_TABLE = "atlas_work_jobs" as const;
export const WORK_JOB_CLAIM_RPC = "atlas_claim_work_job" as const;

export class WorkJobClaimUnavailableError extends Error {
  readonly code = "work_job_claim_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "WorkJobClaimUnavailableError";
  }
}

export type WorkJobClaimResult =
  | { action: "created"; job: WorkJobRecord }
  | { action: "reused"; job: WorkJobRecord };

type ClaimRow = {
  id: string;
  user_id: string;
  idempotency_key: string;
  assignment: string;
  metadata: Record<string, unknown> | null;
  status: string;
  attempt_count: number;
  max_attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type MemoryClaimDb = {
  byUserKey: Map<string, WorkJobRecord>;
  locks: Map<string, Promise<void>>;
};

function memoryClaimDb(): MemoryClaimDb {
  const scope = globalThis as typeof globalThis & {
    __atlasWorkJobClaims?: MemoryClaimDb;
  };
  if (!scope.__atlasWorkJobClaims) {
    scope.__atlasWorkJobClaims = {
      byUserKey: new Map(),
      locks: new Map(),
    };
  }
  return scope.__atlasWorkJobClaims;
}

function userKey(userId: string, idempotencyKey: string): string {
  return `${userId}::${idempotencyKey}`;
}

function isMissingSchema(message: string | undefined): boolean {
  return Boolean(
    message &&
      /schema cache|does not exist|Could not find the table|function .* does not exist/i.test(
        message,
      ),
  );
}

export function claimRowToWorkJob(row: {
  id: string;
  userId: string;
  idempotencyKey: string;
  assignment: string;
  metadata?: Readonly<Record<string, unknown>> | null;
  status?: WorkJobStatus;
  attemptCount?: number;
  maxAttempts?: number;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}): WorkJobRecord {
  return {
    id: row.id,
    userId: row.userId,
    assignment: row.assignment,
    idempotencyKey: row.idempotencyKey,
    metadata: row.metadata ?? {},
    status: row.status ?? "queued",
    attemptCount: row.attemptCount ?? 0,
    maxAttempts: row.maxAttempts ?? 3,
    error: row.error ?? null,
    visionGate: null,
    result: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt ?? null,
  };
}

function fromDbRow(row: ClaimRow): WorkJobRecord {
  const status = (
    [
      "queued",
      "running",
      "completed",
      "failed",
      "awaiting_confirmation",
    ] as const
  ).includes(row.status as WorkJobStatus)
    ? (row.status as WorkJobStatus)
    : "queued";
  return claimRowToWorkJob({
    id: row.id,
    userId: row.user_id,
    idempotencyKey: row.idempotency_key,
    assignment: row.assignment,
    metadata:
      row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  });
}

function parseRpcPayload(data: unknown): WorkJobClaimResult {
  if (!data || typeof data !== "object") {
    throw new WorkJobClaimUnavailableError("atlas_claim_work_job returned empty");
  }
  const row = data as Record<string, unknown>;
  const action = row.action === "reused" ? "reused" : "created";
  const id = typeof row.id === "string" ? row.id : "";
  const userId = typeof row.user_id === "string" ? row.user_id : "";
  const idempotencyKey =
    typeof row.idempotency_key === "string" ? row.idempotency_key : "";
  if (!id || !userId || !idempotencyKey) {
    throw new WorkJobClaimUnavailableError("atlas_claim_work_job payload incomplete");
  }
  const job = fromDbRow({
    id,
    user_id: userId,
    idempotency_key: idempotencyKey,
    assignment: typeof row.assignment === "string" ? row.assignment : "",
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    status: typeof row.status === "string" ? row.status : "queued",
    attempt_count: typeof row.attempt_count === "number" ? row.attempt_count : 0,
    max_attempts: typeof row.max_attempts === "number" ? row.max_attempts : 3,
    error: typeof row.error === "string" ? row.error : null,
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString(),
    updated_at:
      typeof row.updated_at === "string"
        ? row.updated_at
        : new Date().toISOString(),
    completed_at: typeof row.completed_at === "string" ? row.completed_at : null,
  });
  return { action, job };
}

async function withUserKeyLock<T>(
  key: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const db = memoryClaimDb();
  const previous = db.locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  db.locks.set(
    key,
    previous.then(() => next).catch(() => next),
  );
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (db.locks.get(key) === next) db.locks.delete(key);
  }
}

async function claimInSharedUniqueIndex(
  job: WorkJobRecord,
): Promise<WorkJobClaimResult> {
  const key = userKey(job.userId, job.idempotencyKey);
  return withUserKeyLock(key, () => {
    const db = memoryClaimDb();
    const existing = db.byUserKey.get(key);
    if (existing && existing.userId === job.userId) {
      return { action: "reused" as const, job: existing };
    }
    db.byUserKey.set(key, job);
    return { action: "created" as const, job };
  });
}

async function claimInSupabase(
  job: WorkJobRecord,
): Promise<WorkJobClaimResult> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    throw new WorkJobClaimUnavailableError(
      "work_job_claim_unavailable: Supabase service role required",
    );
  }

  const untyped = client as unknown as {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{
            data: ClaimRow | null;
            error: { message?: string; code?: string } | null;
          }>;
        };
      };
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{
              data: ClaimRow | null;
              error: { message?: string; code?: string } | null;
            }>;
          };
        };
      };
    };
  };

  const rpc = await untyped.rpc(WORK_JOB_CLAIM_RPC, {
    p_id: job.id,
    p_user_id: job.userId,
    p_idempotency_key: job.idempotencyKey,
    p_assignment: job.assignment,
    p_metadata: job.metadata ?? {},
    p_max_attempts: job.maxAttempts,
  });

  if (!rpc.error && rpc.data) {
    return parseRpcPayload(rpc.data);
  }

  if (rpc.error && !isMissingSchema(rpc.error.message)) {
    throw new WorkJobClaimUnavailableError(
      `atlas_claim_work_job failed: ${rpc.error.message}`,
    );
  }

  // Function not applied yet — INSERT first (unique constraint is the atomic primitive).
  const inserted = await untyped
    .from(WORK_JOB_CLAIM_TABLE)
    .insert({
      id: job.id,
      user_id: job.userId,
      idempotency_key: job.idempotencyKey,
      assignment: job.assignment,
      metadata: job.metadata ?? {},
      status: job.status,
      attempt_count: job.attemptCount,
      max_attempts: job.maxAttempts,
      error: job.error,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
      completed_at: job.completedAt,
    })
    .select("*")
    .single();

  if (!inserted.error && inserted.data) {
    return { action: "created", job: fromDbRow(inserted.data) };
  }

  if (inserted.error?.code === "23505") {
    const existing = await untyped
      .from(WORK_JOB_CLAIM_TABLE)
      .select("*")
      .eq("user_id", job.userId)
      .eq("idempotency_key", job.idempotencyKey)
      .maybeSingle();
    if (existing.error || !existing.data) {
      throw new WorkJobClaimUnavailableError(
        "unique conflict but existing work-job row could not be read",
      );
    }
    if (existing.data.user_id !== job.userId) {
      throw new WorkJobClaimUnavailableError("work-job claim owner mismatch");
    }
    return { action: "reused", job: fromDbRow(existing.data) };
  }

  throw new WorkJobClaimUnavailableError(
    inserted.error?.message ?? "atlas_work_jobs insert unavailable",
  );
}

/**
 * Insert-or-reuse one work job for (userId, idempotencyKey).
 * Winner = created. Loser = reused existing row. Never a second identity.
 */
export async function claimWorkJob(
  job: WorkJobRecord,
): Promise<WorkJobClaimResult> {
  if (!job.userId.trim() || !job.idempotencyKey.trim()) {
    throw new WorkJobClaimUnavailableError("userId and idempotencyKey required");
  }

  const client = createServiceRoleClientIfConfigured();
  if (client) {
    return claimInSupabase(job);
  }
  if (isAtlasProduction()) {
    throw new WorkJobClaimUnavailableError(
      "work_job_claim_unavailable: Production refuses Map-only work-job claim",
    );
  }
  return claimInSharedUniqueIndex(job);
}

export function resetWorkJobClaimStoreForTests(): void {
  const db = memoryClaimDb();
  db.byUserKey.clear();
  db.locks.clear();
}

export function listClaimedWorkJobIdsForTests(
  userId: string,
  idempotencyKey: string,
): string[] {
  const row = memoryClaimDb().byUserKey.get(userKey(userId, idempotencyKey));
  return row ? [row.id] : [];
}

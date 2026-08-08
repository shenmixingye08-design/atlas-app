import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  assertXPostBackendReady,
  isXPostDurableRequired,
  resolveXPostStorageBackend,
  X_POST_LEASE_MS,
  X_POST_MAX_ATTEMPTS_DEFAULT,
} from "./x-post-backend";
import type { XScheduledPost } from "./types";

export type XPostJobStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "claimed"
  | "posting"
  | "posted"
  | "retry_scheduled"
  | "failed"
  | "canceled"
  | "unknown_outcome";

export type XPostApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

export type XPostCompletionEvidence = {
  xPostJobId: string;
  ownerId: string;
  contentHash: string;
  providerPostId: string;
  providerRequestId: string | null;
  postedAt: string;
  connectionId: string | null;
  providerResponseHash: string | null;
  diagnosticId: string;
  verifiedAt: string;
};

export type DurableXPostJob = {
  xPostJobId: string;
  ownerId: string;
  organizationId: string | null;
  automationId: string | null;
  runId: string | null;
  draftId: string | null;
  connectionId: string | null;
  content: string;
  contentHash: string;
  mediaIds: string[];
  status: XPostJobStatus;
  approvalStatus: XPostApprovalStatus;
  scheduledAt: string | null;
  nextAttemptAt: string | null;
  claimedBy: string | null;
  claimedAt: string | null;
  leaseExpiresAt: string | null;
  attempt: number;
  maxAttempts: number;
  idempotencyKey: string;
  providerRequestId: string | null;
  providerPostId: string | null;
  providerResponseHash: string | null;
  postedAt: string | null;
  canceledAt: string | null;
  failedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  diagnosticId: string | null;
  completionEvidence: XPostCompletionEvidence | null;
  createdAt: string;
  updatedAt: string;
};

export class XPostStoreUnavailableError extends Error {
  readonly code = "x_post_store_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "XPostStoreUnavailableError";
  }
}

type MemoryBucket = Map<string, DurableXPostJob>;

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasDurableXPostJobs?: MemoryBucket;
  };
  if (!scope.__atlasDurableXPostJobs) {
    scope.__atlasDurableXPostJobs = new Map();
  }
  return scope.__atlasDurableXPostJobs;
}

export function resetDurableXPostJobsForTests(): void {
  getMemoryBucket().clear();
}

export function hashXPostContent(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex").slice(0, 48);
}

export function buildXPostIdempotencyKey(input: {
  ownerId: string;
  draftIdOrSourceId: string;
  contentHash: string;
  scheduledAt: string;
  eventVersion?: string;
}): string {
  const version = input.eventVersion ?? "v1";
  const raw = [
    input.ownerId,
    input.draftIdOrSourceId,
    input.contentHash,
    input.scheduledAt,
    version,
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 48);
}

const ALLOWED_TRANSITIONS: Record<XPostJobStatus, readonly XPostJobStatus[]> = {
  draft: ["pending_approval", "approved", "scheduled", "canceled"],
  pending_approval: ["approved", "canceled", "failed"],
  approved: ["scheduled", "claimed", "canceled"],
  scheduled: ["claimed", "canceled", "approved"],
  claimed: ["posting", "retry_scheduled", "failed", "canceled", "unknown_outcome"],
  posting: [
    "posted",
    "retry_scheduled",
    "failed",
    "unknown_outcome",
  ],
  posted: [],
  retry_scheduled: ["claimed", "failed", "canceled"],
  failed: [],
  canceled: [],
  unknown_outcome: [], // never auto-retry to posting
};

export function canTransitionXPostStatus(
  from: XPostJobStatus,
  to: XPostJobStatus,
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function jobToLegacyScheduled(job: DurableXPostJob): XScheduledPost {
  const statusMap: Record<
    XPostJobStatus,
    XScheduledPost["status"]
  > = {
    draft: "pending",
    pending_approval: "pending",
    approved: "pending",
    scheduled: "pending",
    claimed: "pending",
    posting: "pending",
    posted: "posted",
    retry_scheduled: "pending",
    failed: "failed",
    canceled: "cancelled",
    unknown_outcome: "failed",
  };
  return {
    id: job.xPostJobId,
    userId: job.ownerId,
    text: job.content,
    scheduledFor: job.scheduledAt ?? job.createdAt,
    automationId: job.automationId,
    createdAt: job.createdAt,
    status: statusMap[job.status],
    errorMessage: job.lastErrorMessage,
  };
}

function dbRowToJob(data: Record<string, unknown>): DurableXPostJob {
  return {
    xPostJobId: String(data.x_post_job_id),
    ownerId: String(data.owner_id),
    organizationId: (data.organization_id as string | null) ?? null,
    automationId: (data.automation_id as string | null) ?? null,
    runId: (data.run_id as string | null) ?? null,
    draftId: (data.draft_id as string | null) ?? null,
    connectionId: (data.connection_id as string | null) ?? null,
    content: String(data.content),
    contentHash: String(data.content_hash),
    mediaIds: Array.isArray(data.media_ids)
      ? (data.media_ids as string[])
      : [],
    status: data.status as XPostJobStatus,
    approvalStatus: data.approval_status as XPostApprovalStatus,
    scheduledAt: (data.scheduled_at as string | null) ?? null,
    nextAttemptAt: (data.next_attempt_at as string | null) ?? null,
    claimedBy: (data.claimed_by as string | null) ?? null,
    claimedAt: (data.claimed_at as string | null) ?? null,
    leaseExpiresAt: (data.lease_expires_at as string | null) ?? null,
    attempt: Number(data.attempt ?? 0),
    maxAttempts: Number(data.max_attempts ?? X_POST_MAX_ATTEMPTS_DEFAULT),
    idempotencyKey: String(data.idempotency_key),
    providerRequestId: (data.provider_request_id as string | null) ?? null,
    providerPostId: (data.provider_post_id as string | null) ?? null,
    providerResponseHash: (data.provider_response_hash as string | null) ?? null,
    postedAt: (data.posted_at as string | null) ?? null,
    canceledAt: (data.canceled_at as string | null) ?? null,
    failedAt: (data.failed_at as string | null) ?? null,
    lastErrorCode: (data.last_error_code as string | null) ?? null,
    lastErrorMessage: (data.last_error_message as string | null) ?? null,
    diagnosticId: (data.diagnostic_id as string | null) ?? null,
    completionEvidence:
      (data.completion_evidence as XPostCompletionEvidence | null) ?? null,
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

function jobToDbPayload(job: DurableXPostJob): Record<string, unknown> {
  return {
    x_post_job_id: job.xPostJobId,
    owner_id: job.ownerId,
    organization_id: job.organizationId,
    automation_id: job.automationId,
    run_id: job.runId,
    draft_id: job.draftId,
    connection_id: job.connectionId,
    content: job.content,
    content_hash: job.contentHash,
    media_ids: job.mediaIds,
    status: job.status,
    approval_status: job.approvalStatus,
    scheduled_at: job.scheduledAt,
    next_attempt_at: job.nextAttemptAt,
    claimed_by: job.claimedBy,
    claimed_at: job.claimedAt,
    lease_expires_at: job.leaseExpiresAt,
    attempt: job.attempt,
    max_attempts: job.maxAttempts,
    idempotency_key: job.idempotencyKey,
    provider_request_id: job.providerRequestId,
    provider_post_id: job.providerPostId,
    provider_response_hash: job.providerResponseHash,
    posted_at: job.postedAt,
    canceled_at: job.canceledAt,
    failed_at: job.failedAt,
    last_error_code: job.lastErrorCode,
    last_error_message: job.lastErrorMessage,
    diagnostic_id: job.diagnosticId,
    completion_evidence: job.completionEvidence,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  };
}

export async function insertDurableXPostJob(input: {
  ownerId: string;
  content: string;
  scheduledAt: string;
  automationId?: string | null;
  draftId?: string | null;
  organizationId?: string | null;
  connectionId?: string | null;
  approvalStatus?: XPostApprovalStatus;
  eventVersion?: string;
}): Promise<{ job: DurableXPostJob; created: boolean }> {
  if (!input.ownerId.trim()) {
    throw new XPostStoreUnavailableError(
      "[x-post] P0-5: ownerId required for durable schedule",
    );
  }
  assertXPostBackendReady();

  const content = input.content.trim();
  const contentHash = hashXPostContent(content);
  const sourceId = input.draftId?.trim() || `sched_${input.scheduledAt}`;
  const idempotencyKey = buildXPostIdempotencyKey({
    ownerId: input.ownerId,
    draftIdOrSourceId: sourceId,
    contentHash,
    scheduledAt: input.scheduledAt,
    eventVersion: input.eventVersion,
  });

  const now = new Date().toISOString();
  const job: DurableXPostJob = {
    xPostJobId: `xpj_${randomUUID()}`,
    ownerId: input.ownerId,
    organizationId: input.organizationId ?? null,
    automationId: input.automationId ?? null,
    runId: null,
    draftId: input.draftId ?? null,
    connectionId: input.connectionId ?? null,
    content,
    contentHash,
    mediaIds: [],
    status: "scheduled",
    approvalStatus: input.approvalStatus ?? "approved",
    scheduledAt: input.scheduledAt,
    nextAttemptAt: input.scheduledAt,
    claimedBy: null,
    claimedAt: null,
    leaseExpiresAt: null,
    attempt: 0,
    maxAttempts: X_POST_MAX_ATTEMPTS_DEFAULT,
    idempotencyKey,
    providerRequestId: null,
    providerPostId: null,
    providerResponseHash: null,
    postedAt: null,
    canceledAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    diagnosticId: `xdiag_${randomUUID().slice(0, 12)}`,
    completionEvidence: null,
    createdAt: now,
    updatedAt: now,
  };

  const backend = resolveXPostStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: durable insert requires Supabase — Map fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_jobs")
      .insert(jobToDbPayload(job) as never)
      .select("*")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        const existing = await client
          .from("atlas_x_post_jobs")
          .select("*")
          .eq("owner_id", job.ownerId)
          .eq("idempotency_key", job.idempotencyKey)
          .maybeSingle();
        if (existing.data) {
          return {
            job: dbRowToJob(existing.data as Record<string, unknown>),
            created: false,
          };
        }
      }
      throw new XPostStoreUnavailableError(
        `[x-post] P0-5: durable insert failed — memory fallback disabled (${error.message})`,
      );
    }
    if (!data) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: durable insert returned empty",
      );
    }
    return {
      job: dbRowToJob(data as Record<string, unknown>),
      created: true,
    };
  }

  // memory_durable / local (non-Production)
  const bucket = getMemoryBucket();
  for (const existing of bucket.values()) {
    if (
      existing.ownerId === job.ownerId &&
      existing.idempotencyKey === job.idempotencyKey
    ) {
      return { job: existing, created: false };
    }
  }
  bucket.set(job.xPostJobId, job);
  return { job, created: true };
}

export async function listDurableXPostJobs(input: {
  ownerId: string;
  pendingOnly?: boolean;
}): Promise<DurableXPostJob[]> {
  if (!input.ownerId.trim()) return [];
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: list requires Supabase — Map fallback disabled",
      );
    }
    let query = client
      .from("atlas_x_post_jobs")
      .select("*")
      .eq("owner_id", input.ownerId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (input.pendingOnly) {
      query = query.in("status", [
        "scheduled",
        "approved",
        "retry_scheduled",
        "claimed",
        "posting",
        "pending_approval",
      ]);
    }
    const { data, error } = await query;
    if (error) {
      throw new XPostStoreUnavailableError(error.message);
    }
    return (data ?? []).map((row) =>
      dbRowToJob(row as Record<string, unknown>),
    );
  }

  return [...getMemoryBucket().values()]
    .filter((j) => {
      if (j.ownerId !== input.ownerId) return false;
      if (!input.pendingOnly) return true;
      return [
        "scheduled",
        "approved",
        "retry_scheduled",
        "claimed",
        "posting",
        "pending_approval",
      ].includes(j.status);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getDurableXPostJob(input: {
  xPostJobId: string;
  ownerId: string;
}): Promise<DurableXPostJob | null> {
  if (!input.ownerId.trim()) return null;
  const backend = resolveXPostStorageBackend();
  if (backend === "supabase") {
    assertXPostBackendReady();
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: get requires Supabase",
      );
    }
    const { data, error } = await client
      .from("atlas_x_post_jobs")
      .select("*")
      .eq("x_post_job_id", input.xPostJobId)
      .eq("owner_id", input.ownerId)
      .maybeSingle();
    if (error) throw new XPostStoreUnavailableError(error.message);
    if (!data) return null;
    return dbRowToJob(data as Record<string, unknown>);
  }
  const job = getMemoryBucket().get(input.xPostJobId);
  if (!job || job.ownerId !== input.ownerId) return null;
  return job;
}

/** Atomic claim of due jobs. Production: RPC SKIP LOCKED. */
export async function claimDueXPostJobs(input: {
  workerId: string;
  limit?: number;
  leaseMs?: number;
  nowMs?: number;
}): Promise<DurableXPostJob[]> {
  assertXPostBackendReady();
  const backend = resolveXPostStorageBackend();
  const now = new Date(input.nowMs ?? Date.now());
  const nowIso = now.toISOString();
  const leaseMs = input.leaseMs ?? X_POST_LEASE_MS;
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: claim requires Supabase — Map fallback disabled",
      );
    }
    const { data, error } = await client.rpc("atlas_claim_x_post_jobs", {
      p_worker_id: input.workerId,
      p_limit: limit,
      p_lease_ms: leaseMs,
      p_now: nowIso,
    });
    if (error) {
      // Migration missing RPC → fail-closed (no Map claim)
      throw new XPostStoreUnavailableError(
        `[x-post] P0-5: claim RPC unavailable — fail-closed (${error.message})`,
      );
    }
    const rows = (Array.isArray(data) ? data : data ? [data] : []) as Record<
      string,
      unknown
    >[];
    return rows.map((row) => dbRowToJob(row));
  }

  // memory_durable atomic-ish claim (single process)
  const due = [...getMemoryBucket().values()]
    .filter((j) => {
      if (
        !["scheduled", "retry_scheduled", "approved"].includes(j.status)
      ) {
        return false;
      }
      if (!["approved", "not_required"].includes(j.approvalStatus)) {
        return false;
      }
      if (j.canceledAt || j.providerPostId) return false;
      const dueAt = new Date(
        j.nextAttemptAt ?? j.scheduledAt ?? j.createdAt,
      ).getTime();
      if (dueAt > now.getTime()) return false;
      if (j.leaseExpiresAt && new Date(j.leaseExpiresAt).getTime() > now.getTime()) {
        return false;
      }
      return true;
    })
    .sort((a, b) =>
      (a.nextAttemptAt ?? a.scheduledAt ?? "").localeCompare(
        b.nextAttemptAt ?? b.scheduledAt ?? "",
      ),
    )
    .slice(0, limit);

  const claimed: DurableXPostJob[] = [];
  for (const j of due) {
    j.status = "claimed";
    j.claimedBy = input.workerId;
    j.claimedAt = nowIso;
    j.leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    j.attempt += 1;
    j.updatedAt = nowIso;
    getMemoryBucket().set(j.xPostJobId, j);
    claimed.push({ ...j });
  }
  return claimed;
}

export async function transitionDurableXPostJob(input: {
  xPostJobId: string;
  ownerId: string;
  toStatus: XPostJobStatus;
  expectedClaimedBy?: string | null;
  patch?: Partial<
    Pick<
      DurableXPostJob,
      | "providerPostId"
      | "providerRequestId"
      | "providerResponseHash"
      | "postedAt"
      | "failedAt"
      | "canceledAt"
      | "lastErrorCode"
      | "lastErrorMessage"
      | "nextAttemptAt"
      | "completionEvidence"
      | "leaseExpiresAt"
      | "claimedBy"
      | "claimedAt"
    >
  >;
}): Promise<DurableXPostJob | null> {
  const existing = await getDurableXPostJob({
    xPostJobId: input.xPostJobId,
    ownerId: input.ownerId,
  });
  if (!existing) return null;

  if (
    input.expectedClaimedBy != null &&
    existing.claimedBy &&
    existing.claimedBy !== input.expectedClaimedBy
  ) {
    throw new XPostStoreUnavailableError(
      "[x-post] P0-5: claimedBy mismatch — state update forbidden",
    );
  }

  if (!canTransitionXPostStatus(existing.status, input.toStatus)) {
    throw new XPostStoreUnavailableError(
      `[x-post] P0-5: illegal transition ${existing.status} → ${input.toStatus}`,
    );
  }

  if (input.toStatus === "posted") {
    const providerPostId =
      input.patch?.providerPostId ?? existing.providerPostId;
    if (!providerPostId) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: providerPostId required for posted",
      );
    }
  }

  const now = new Date().toISOString();
  const next: DurableXPostJob = {
    ...existing,
    ...input.patch,
    status: input.toStatus,
    updatedAt: now,
  };
  if (input.toStatus === "canceled" && !next.canceledAt) {
    next.canceledAt = now;
  }
  if (input.toStatus === "failed" && !next.failedAt) {
    next.failedAt = now;
  }

  const backend = resolveXPostStorageBackend();
  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new XPostStoreUnavailableError(
        "[x-post] P0-5: transition requires Supabase",
      );
    }
    let query = client
      .from("atlas_x_post_jobs")
      .update(jobToDbPayload(next) as never)
      .eq("x_post_job_id", input.xPostJobId)
      .eq("owner_id", input.ownerId);
    if (input.expectedClaimedBy) {
      query = query.eq("claimed_by", input.expectedClaimedBy);
    }
    const { data, error } = await query.select("*").maybeSingle();
    if (error) throw new XPostStoreUnavailableError(error.message);
    if (!data) return null;
    return dbRowToJob(data as Record<string, unknown>);
  }

  getMemoryBucket().set(next.xPostJobId, next);
  return next;
}

export async function heartbeatXPostJob(input: {
  xPostJobId: string;
  ownerId: string;
  workerId: string;
  leaseMs?: number;
}): Promise<boolean> {
  const job = await getDurableXPostJob(input);
  if (!job || job.claimedBy !== input.workerId) return false;
  if (!["claimed", "posting"].includes(job.status)) return false;
  const leaseMs = input.leaseMs ?? X_POST_LEASE_MS;
  await transitionDurableXPostJob({
    xPostJobId: input.xPostJobId,
    ownerId: input.ownerId,
    toStatus: job.status,
    expectedClaimedBy: input.workerId,
    patch: {
      leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
    },
  });
  return true;
}

export async function markXPostUnknownOutcome(input: {
  xPostJobId: string;
  ownerId: string;
  workerId: string;
  providerPostId?: string | null;
  providerRequestId?: string | null;
  errorMessage: string;
}): Promise<DurableXPostJob | null> {
  return transitionDurableXPostJob({
    xPostJobId: input.xPostJobId,
    ownerId: input.ownerId,
    toStatus: "unknown_outcome",
    expectedClaimedBy: input.workerId,
    patch: {
      providerPostId: input.providerPostId ?? null,
      providerRequestId: input.providerRequestId ?? null,
      lastErrorCode: "unknown_outcome",
      lastErrorMessage: input.errorMessage.slice(0, 500),
      failedAt: new Date().toISOString(),
    },
  });
}

export async function scheduleXPostRetry(input: {
  xPostJobId: string;
  ownerId: string;
  workerId: string;
  errorCode: string;
  errorMessage: string;
  delayMs: number;
  permanent?: boolean;
}): Promise<DurableXPostJob | null> {
  const job = await getDurableXPostJob(input);
  if (!job) return null;
  if (job.status === "posted" || job.status === "unknown_outcome") {
    throw new XPostStoreUnavailableError(
      "[x-post] P0-5: cannot retry posted/unknown_outcome",
    );
  }
  if (input.permanent || job.attempt >= job.maxAttempts) {
    return transitionDurableXPostJob({
      xPostJobId: input.xPostJobId,
      ownerId: input.ownerId,
      toStatus: "failed",
      expectedClaimedBy: input.workerId,
      patch: {
        lastErrorCode: input.errorCode,
        lastErrorMessage: input.errorMessage.slice(0, 500),
        claimedBy: null,
        leaseExpiresAt: null,
      },
    });
  }
  return transitionDurableXPostJob({
    xPostJobId: input.xPostJobId,
    ownerId: input.ownerId,
    toStatus: "retry_scheduled",
    expectedClaimedBy: input.workerId,
    patch: {
      nextAttemptAt: new Date(Date.now() + input.delayMs).toISOString(),
      lastErrorCode: input.errorCode,
      lastErrorMessage: input.errorMessage.slice(0, 500),
      claimedBy: null,
      claimedAt: null,
      leaseExpiresAt: null,
    },
  });
}

export async function cancelDurableXPostJob(input: {
  xPostJobId: string;
  ownerId: string;
}): Promise<DurableXPostJob | null> {
  const job = await getDurableXPostJob(input);
  if (!job) return null;
  if (["posted", "posting", "unknown_outcome"].includes(job.status)) {
    throw new XPostStoreUnavailableError(
      `[x-post] P0-5: cannot cancel status=${job.status}`,
    );
  }
  return transitionDurableXPostJob({
    xPostJobId: input.xPostJobId,
    ownerId: input.ownerId,
    toStatus: "canceled",
  });
}

export function classifyXPostError(error: unknown): {
  code: string;
  retryable: boolean;
  permanent: boolean;
  delayMs: number;
} {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error);
  if (/revok|unauthorized|401|invalid.?token|reconnect/.test(message)) {
    return {
      code: "auth_expired",
      retryable: false,
      permanent: true,
      delayMs: 0,
    };
  }
  if (/429|rate.?limit|too many/.test(message)) {
    return {
      code: "rate_limit",
      retryable: true,
      permanent: false,
      delayMs: 120_000,
    };
  }
  if (/timeout|timed.?out|network|econn|fetch failed|503|502/.test(message)) {
    return {
      code: "transient",
      retryable: true,
      permanent: false,
      delayMs: 30_000,
    };
  }
  if (/duplicate|already.?posted|idempotency/.test(message)) {
    return {
      code: "duplicate_content",
      retryable: false,
      permanent: true,
      delayMs: 0,
    };
  }
  if (/invalid|validation|forbidden|403/.test(message)) {
    return {
      code: "invalid_content",
      retryable: false,
      permanent: true,
      delayMs: 0,
    };
  }
  return {
    code: "provider_error",
    retryable: true,
    permanent: false,
    delayMs: 60_000,
  };
}

/** Expose whether Production would refuse Map SoT (for CI/tests). */
export function assertNoMemoryFallbackInProduction(): void {
  if (isXPostDurableRequired() && resolveXPostStorageBackend() === "supabase") {
    assertXPostBackendReady();
  }
}

/**
 * Resumable Word / deliverable job stages.
 * Persists last successful stage so recover resumes mid-pipeline.
 */

import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import { consumeWordFault } from "./fault-inject";

export const WORD_JOB_STAGES = [
  "REQUEST_RECEIVED",
  "AI_CONTENT_STARTED",
  "AI_CONTENT_COMPLETED",
  "DOCX_GENERATION_STARTED",
  "DOCX_GENERATION_COMPLETED",
  "DOCX_VERIFY_COMPLETED",
  "DOCX_STORAGE_STARTED",
  "DOCX_STORAGE_COMPLETED",
  "METADATA_CREATED",
  "DOWNLOAD_READY",
  "NOTIFICATION_SENT",
  "COMPLETED",
] as const;

export type WordJobStage = (typeof WORD_JOB_STAGES)[number];

export type WordJobStatus =
  | "running"
  | "completed"
  | "failed"
  | "awaiting_resume";

export type WordJobRecord = {
  id: string;
  userId: string;
  format: string;
  stage: WordJobStage;
  status: WordJobStatus;
  assignment: string;
  sourceContent: string;
  baseFileName: string;
  deliverableId: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  heartbeatAt: string | null;
  attemptCount: number;
  lastErrorStage: string | null;
  lastErrorMessage: string | null;
  notificationId: string | null;
  notificationStatus: "pending" | "sent" | "failed" | null;
  createdAt: string;
  updatedAt: string;
};

const LEASE_MS = 1000 * 60 * 2; // 2 minutes
const STAGE_INDEX = new Map(WORD_JOB_STAGES.map((s, i) => [s, i]));

type JobBucket = Map<string, WordJobRecord>;

function getJobBucket(): JobBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasDeliverableJobs?: JobBucket;
  };
  if (!scope.__atlasDeliverableJobs) {
    scope.__atlasDeliverableJobs = new Map();
  }
  return scope.__atlasDeliverableJobs;
}

export function resetWordJobsForTests(): void {
  getJobBucket().clear();
}

export function stageReached(current: WordJobStage, target: WordJobStage): boolean {
  return (STAGE_INDEX.get(current) ?? -1) >= (STAGE_INDEX.get(target) ?? 999);
}

export function nextResumeStage(job: WordJobRecord): WordJobStage {
  // Resume from the stage AFTER the last successful one when failed mid-flight.
  if (job.status === "completed") return "COMPLETED";
  return job.stage;
}

function nowIso(): string {
  return new Date().toISOString();
}

function leaseExpiryIso(): string {
  return new Date(Date.now() + LEASE_MS).toISOString();
}

async function upsertJobRemote(job: WordJobRecord): Promise<void> {
  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return;
    const { error } = await client.from("atlas_deliverable_jobs").upsert({
      id: job.id,
      user_id: job.userId,
      format: job.format,
      stage: job.stage,
      status: job.status,
      assignment: job.assignment,
      source_content: job.sourceContent,
      base_file_name: job.baseFileName,
      deliverable_id: job.deliverableId,
      lease_owner: job.leaseOwner,
      lease_expires_at: job.leaseExpiresAt,
      heartbeat_at: job.heartbeatAt,
      attempt_count: job.attemptCount,
      last_error_stage: job.lastErrorStage,
      last_error_message: job.lastErrorMessage,
      notification_id: job.notificationId,
      notification_status: job.notificationStatus,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    } as never);
    if (error) {
      console.error("[atlas_deliverable_jobs] upsert failed", error.message);
    }
  } catch (error) {
    console.error("[atlas_deliverable_jobs] upsert error", error);
  }
}

async function loadJobRemote(id: string): Promise<WordJobRecord | null> {
  try {
    const client = createServiceRoleClientIfConfigured();
    if (!client) return null;
    const { data, error } = await client
      .from("atlas_deliverable_jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      id: string;
      user_id: string;
      format: string;
      stage: string;
      status: string;
      assignment: string;
      source_content: string;
      base_file_name: string;
      deliverable_id: string | null;
      lease_owner: string | null;
      lease_expires_at: string | null;
      heartbeat_at: string | null;
      attempt_count: number;
      last_error_stage: string | null;
      last_error_message: string | null;
      notification_id: string | null;
      notification_status: string | null;
      created_at: string;
      updated_at: string;
    };
    return {
      id: row.id,
      userId: row.user_id,
      format: row.format,
      stage: row.stage as WordJobStage,
      status: row.status as WordJobStatus,
      assignment: row.assignment,
      sourceContent: row.source_content,
      baseFileName: row.base_file_name,
      deliverableId: row.deliverable_id,
      leaseOwner: row.lease_owner,
      leaseExpiresAt: row.lease_expires_at,
      heartbeatAt: row.heartbeat_at,
      attemptCount: row.attempt_count,
      lastErrorStage: row.last_error_stage,
      lastErrorMessage: row.last_error_message,
      notificationId: row.notification_id,
      notificationStatus: row.notification_status as WordJobRecord["notificationStatus"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export async function getWordJob(id: string): Promise<WordJobRecord | null> {
  return getJobBucket().get(id) ?? (await loadJobRemote(id));
}

/**
 * Claim a job lease. Prevents the same jobId from running on multiple workers.
 * Returns existing completed/running job when already claimed.
 */
export async function claimWordJob(input: {
  jobId: string;
  userId: string;
  assignment: string;
  sourceContent: string;
  baseFileName: string;
  format?: string;
  workerId?: string;
}): Promise<
  | { ok: true; job: WordJobRecord; claimed: boolean }
  | { ok: false; reason: "owned_by_other" | "already_completed"; job: WordJobRecord }
> {
  if (consumeWordFault("parallel_job_race")) {
    // Simulate another worker holding the lease.
    const ghost: WordJobRecord = {
      id: input.jobId,
      userId: input.userId,
      format: input.format ?? "docx",
      stage: "DOCX_GENERATION_STARTED",
      status: "running",
      assignment: input.assignment,
      sourceContent: input.sourceContent,
      baseFileName: input.baseFileName,
      deliverableId: null,
      leaseOwner: "other-worker",
      leaseExpiresAt: leaseExpiryIso(),
      heartbeatAt: nowIso(),
      attemptCount: 1,
      lastErrorStage: null,
      lastErrorMessage: null,
      notificationId: null,
      notificationStatus: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    getJobBucket().set(ghost.id, ghost);
    return { ok: false, reason: "owned_by_other", job: ghost };
  }

  const workerId = input.workerId ?? `worker_${crypto.randomUUID().slice(0, 8)}`;
  const existing = await getWordJob(input.jobId);

  if (existing) {
    if (existing.status === "completed" && existing.deliverableId) {
      return { ok: false, reason: "already_completed", job: existing };
    }
    const leaseValid =
      existing.leaseOwner &&
      existing.leaseExpiresAt &&
      new Date(existing.leaseExpiresAt).getTime() > Date.now();
    if (
      leaseValid &&
      existing.status === "running" &&
      existing.leaseOwner !== workerId
    ) {
      return { ok: false, reason: "owned_by_other", job: existing };
    }
    // Stale lease or awaiting resume — take over.
    const resumed: WordJobRecord = {
      ...existing,
      status: "running",
      leaseOwner: workerId,
      leaseExpiresAt: leaseExpiryIso(),
      heartbeatAt: nowIso(),
      attemptCount: existing.attemptCount + 1,
      updatedAt: nowIso(),
      sourceContent: existing.sourceContent || input.sourceContent,
      assignment: existing.assignment || input.assignment,
      baseFileName: existing.baseFileName || input.baseFileName,
    };
    getJobBucket().set(resumed.id, resumed);
    await upsertJobRemote(resumed);
    return { ok: true, job: resumed, claimed: true };
  }

  const created: WordJobRecord = {
    id: input.jobId,
    userId: input.userId,
    format: input.format ?? "docx",
    stage: "REQUEST_RECEIVED",
    status: "running",
    assignment: input.assignment,
    sourceContent: input.sourceContent,
    baseFileName: input.baseFileName,
    deliverableId: null,
    leaseOwner: workerId,
    leaseExpiresAt: leaseExpiryIso(),
    heartbeatAt: nowIso(),
    attemptCount: 1,
    lastErrorStage: null,
    lastErrorMessage: null,
    notificationId: null,
    notificationStatus: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getJobBucket().set(created.id, created);
  await upsertJobRemote(created);
  return { ok: true, job: created, claimed: true };
}

export async function advanceWordJobStage(
  jobId: string,
  stage: WordJobStage,
  patch?: Partial<
    Pick<
      WordJobRecord,
      | "deliverableId"
      | "sourceContent"
      | "notificationId"
      | "notificationStatus"
      | "status"
    >
  >,
): Promise<WordJobRecord | null> {
  const current = await getWordJob(jobId);
  if (!current) return null;

  // Never move backwards.
  const nextStage = stageReached(current.stage, stage) ? current.stage : stage;
  // Actually: only advance forward
  const advanced =
    (STAGE_INDEX.get(stage) ?? -1) >= (STAGE_INDEX.get(current.stage) ?? -1)
      ? stage
      : current.stage;

  const updated: WordJobRecord = {
    ...current,
    stage: advanced,
    ...patch,
    status: patch?.status ?? current.status,
    leaseExpiresAt: leaseExpiryIso(),
    heartbeatAt: nowIso(),
    updatedAt: nowIso(),
  };
  // Prefer explicit advanced stage
  updated.stage = (STAGE_INDEX.get(stage) ?? -1) >= (STAGE_INDEX.get(current.stage) ?? -1)
    ? stage
    : current.stage;
  void nextStage;

  getJobBucket().set(updated.id, updated);
  await upsertJobRemote(updated);
  return updated;
}

export async function heartbeatWordJob(jobId: string): Promise<void> {
  const current = await getWordJob(jobId);
  if (!current || current.status !== "running") return;
  const updated: WordJobRecord = {
    ...current,
    heartbeatAt: nowIso(),
    leaseExpiresAt: leaseExpiryIso(),
    updatedAt: nowIso(),
  };
  getJobBucket().set(updated.id, updated);
  await upsertJobRemote(updated);
}

export async function failWordJob(
  jobId: string,
  stage: WordJobStage,
  message: string,
): Promise<WordJobRecord | null> {
  const current = await getWordJob(jobId);
  if (!current) return null;
  const updated: WordJobRecord = {
    ...current,
    status: "awaiting_resume",
    lastErrorStage: stage,
    lastErrorMessage: message.slice(0, 500),
    leaseOwner: null,
    leaseExpiresAt: null,
    updatedAt: nowIso(),
  };
  getJobBucket().set(updated.id, updated);
  await upsertJobRemote(updated);
  return updated;
}

export async function completeWordJob(
  jobId: string,
  deliverableId: string,
): Promise<WordJobRecord | null> {
  return advanceWordJobStage(jobId, "COMPLETED", {
    deliverableId,
    status: "completed",
  });
}

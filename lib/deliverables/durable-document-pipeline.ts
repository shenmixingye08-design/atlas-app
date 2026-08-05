import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import {
  assertDocumentPipelineBackendReady,
  resolveDocumentPipelineStorageBackend,
} from "./document-pipeline-backend";
import type { DeliverableFormat } from "./types";

export type DocumentPipelineStatus =
  | "queued"
  | "planning"
  | "generating"
  | "rendering"
  | "exporting"
  | "persisting"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled"
  | "retry_scheduled"
  | "timed_out";

export type DocumentPipelineJob = {
  id: string;
  ownerUserId: string;
  organizationId: string | null;
  workJobId: string | null;
  runId: string | null;
  status: DocumentPipelineStatus;
  stage: string;
  requestedFormats: DeliverableFormat[];
  completedFormats: DeliverableFormat[];
  failedFormats: DeliverableFormat[];
  progressPct: number;
  attempt: number;
  maxAttempts: number;
  retryCount: number;
  nextRetryAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  artifactIds: string[];
  completionEvidenceIds: string[];
  checksums: string[];
  byteSizes: number[];
  cancelledAt: string | null;
  timedOutAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export class DocumentPipelineUnavailableError extends Error {
  readonly code = "document_pipeline_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "DocumentPipelineUnavailableError";
  }
}

type MemoryBucket = Map<string, DocumentPipelineJob>;

function getMemoryBucket(): MemoryBucket {
  const scope = globalThis as typeof globalThis & {
    __atlasDurableDocumentPipelineJobs?: MemoryBucket;
  };
  if (!scope.__atlasDurableDocumentPipelineJobs) {
    scope.__atlasDurableDocumentPipelineJobs = new Map();
  }
  return scope.__atlasDurableDocumentPipelineJobs;
}

export function resetDurableDocumentPipelineForTests(): void {
  getMemoryBucket().clear();
}

function toDb(job: DocumentPipelineJob): Record<string, unknown> {
  return {
    id: job.id,
    owner_user_id: job.ownerUserId,
    organization_id: job.organizationId,
    work_job_id: job.workJobId,
    run_id: job.runId,
    status: job.status,
    stage: job.stage,
    requested_formats: job.requestedFormats,
    completed_formats: job.completedFormats,
    failed_formats: job.failedFormats,
    progress_pct: job.progressPct,
    attempt: job.attempt,
    max_attempts: job.maxAttempts,
    retry_count: job.retryCount,
    next_retry_at: job.nextRetryAt,
    error_code: job.errorCode,
    error_message: job.errorMessage,
    artifact_ids: job.artifactIds,
    completion_evidence_ids: job.completionEvidenceIds,
    checksums: job.checksums,
    byte_sizes: job.byteSizes,
    cancelled_at: job.cancelledAt,
    timed_out_at: job.timedOutAt,
    started_at: job.startedAt,
    finished_at: job.finishedAt,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    payload: {},
  };
}

function fromDb(data: Record<string, unknown>): DocumentPipelineJob {
  return {
    id: String(data.id),
    ownerUserId: String(data.owner_user_id),
    organizationId: (data.organization_id as string | null) ?? null,
    workJobId: (data.work_job_id as string | null) ?? null,
    runId: (data.run_id as string | null) ?? null,
    status: data.status as DocumentPipelineStatus,
    stage: String(data.stage ?? "queued"),
    requestedFormats: (data.requested_formats as DeliverableFormat[]) ?? [],
    completedFormats: (data.completed_formats as DeliverableFormat[]) ?? [],
    failedFormats: (data.failed_formats as DeliverableFormat[]) ?? [],
    progressPct: Number(data.progress_pct ?? 0),
    attempt: Number(data.attempt ?? 1),
    maxAttempts: Number(data.max_attempts ?? 3),
    retryCount: Number(data.retry_count ?? 0),
    nextRetryAt: (data.next_retry_at as string | null) ?? null,
    errorCode: (data.error_code as string | null) ?? null,
    errorMessage: (data.error_message as string | null) ?? null,
    artifactIds: (data.artifact_ids as string[]) ?? [],
    completionEvidenceIds: (data.completion_evidence_ids as string[]) ?? [],
    checksums: (data.checksums as string[]) ?? [],
    byteSizes: ((data.byte_sizes as number[]) ?? []).map(Number),
    cancelledAt: (data.cancelled_at as string | null) ?? null,
    timedOutAt: (data.timed_out_at as string | null) ?? null,
    startedAt: (data.started_at as string | null) ?? null,
    finishedAt: (data.finished_at as string | null) ?? null,
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

async function upsertJob(job: DocumentPipelineJob): Promise<DocumentPipelineJob> {
  assertDocumentPipelineBackendReady();
  const backend = resolveDocumentPipelineStorageBackend();
  const next = { ...job, updatedAt: new Date().toISOString() };

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new DocumentPipelineUnavailableError(
        "[document-pipeline] P0-7: upsert failed — memory fallback disabled (supabase_not_configured)",
      );
    }
    const { data, error } = await client
      .from("atlas_document_generation_jobs" as never)
      .upsert(toDb(next) as never, { onConflict: "id" })
      .select("*")
      .maybeSingle();
    if (error || !data) {
      throw new DocumentPipelineUnavailableError(
        `[document-pipeline] P0-7: upsert failed — memory fallback disabled (${error?.message ?? "empty"})`,
      );
    }
    return fromDb(data as Record<string, unknown>);
  }

  if (backend === "memory_durable" || backend === "local") {
    getMemoryBucket().set(next.id, next);
    return next;
  }

  throw new DocumentPipelineUnavailableError(
    "[document-pipeline] P0-7: unknown backend",
  );
}

export async function createDocumentPipelineJob(input: {
  ownerUserId: string;
  requestedFormats: DeliverableFormat[];
  workJobId?: string | null;
  runId?: string | null;
  organizationId?: string | null;
  jobId?: string;
}): Promise<DocumentPipelineJob> {
  const now = new Date().toISOString();
  return upsertJob({
    id: input.jobId ?? `docgen_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
    ownerUserId: input.ownerUserId,
    organizationId: input.organizationId ?? null,
    workJobId: input.workJobId ?? null,
    runId: input.runId ?? null,
    status: "queued",
    stage: "queued",
    requestedFormats: input.requestedFormats,
    completedFormats: [],
    failedFormats: [],
    progressPct: 0,
    attempt: 1,
    maxAttempts: 3,
    retryCount: 0,
    nextRetryAt: null,
    errorCode: null,
    errorMessage: null,
    artifactIds: [],
    completionEvidenceIds: [],
    checksums: [],
    byteSizes: [],
    cancelledAt: null,
    timedOutAt: null,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateDocumentPipelineJob(
  jobId: string,
  ownerUserId: string,
  patch: Partial<DocumentPipelineJob>,
): Promise<DocumentPipelineJob> {
  const existing = await getDocumentPipelineJob(jobId, ownerUserId);
  if (!existing) {
    throw new DocumentPipelineUnavailableError(
      "[document-pipeline] P0-7: job not found for update",
    );
  }
  if (existing.ownerUserId !== ownerUserId) {
    throw new DocumentPipelineUnavailableError(
      "[document-pipeline] P0-7: owner isolation refused update",
    );
  }
  if (existing.status === "cancelled" && patch.status !== "cancelled") {
    throw new DocumentPipelineUnavailableError(
      "[document-pipeline] P0-7: cancelled job cannot resume into active work",
    );
  }
  return upsertJob({ ...existing, ...patch, id: existing.id, ownerUserId });
}

export async function getDocumentPipelineJob(
  jobId: string,
  ownerUserId: string,
): Promise<DocumentPipelineJob | null> {
  assertDocumentPipelineBackendReady();
  const backend = resolveDocumentPipelineStorageBackend();

  if (backend === "supabase") {
    const client = createServiceRoleClientIfConfigured();
    if (!client) {
      throw new DocumentPipelineUnavailableError(
        "[document-pipeline] P0-7: get failed — memory fallback disabled",
      );
    }
    const { data, error } = await client
      .from("atlas_document_generation_jobs" as never)
      .select("*")
      .eq("id", jobId)
      .eq("owner_user_id", ownerUserId)
      .maybeSingle();
    if (error) {
      throw new DocumentPipelineUnavailableError(
        `[document-pipeline] P0-7: get failed — memory fallback disabled (${error.message})`,
      );
    }
    if (!data) return null;
    return fromDb(data as Record<string, unknown>);
  }

  const row = getMemoryBucket().get(jobId);
  if (!row || row.ownerUserId !== ownerUserId) return null;
  return row;
}

export async function cancelDocumentPipelineJob(input: {
  jobId: string;
  ownerUserId: string;
}): Promise<DocumentPipelineJob> {
  return updateDocumentPipelineJob(input.jobId, input.ownerUserId, {
    status: "cancelled",
    stage: "cancelled",
    cancelledAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    nextRetryAt: null,
  });
}

export async function scheduleDocumentPipelineRetry(input: {
  jobId: string;
  ownerUserId: string;
  nextRetryAt: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<DocumentPipelineJob> {
  const existing = await getDocumentPipelineJob(input.jobId, input.ownerUserId);
  if (!existing) {
    throw new DocumentPipelineUnavailableError(
      "[document-pipeline] P0-7: retry target missing",
    );
  }
  if (existing.retryCount + 1 >= existing.maxAttempts) {
    return updateDocumentPipelineJob(input.jobId, input.ownerUserId, {
      status: "failed",
      stage: "failed",
      errorCode: input.errorCode ?? existing.errorCode,
      errorMessage: input.errorMessage ?? "max_retries_exceeded",
      finishedAt: new Date().toISOString(),
      nextRetryAt: null,
    });
  }
  return updateDocumentPipelineJob(input.jobId, input.ownerUserId, {
    status: "retry_scheduled",
    stage: "retry_scheduled",
    retryCount: existing.retryCount + 1,
    attempt: existing.attempt + 1,
    nextRetryAt: input.nextRetryAt,
    errorCode: input.errorCode ?? existing.errorCode,
    errorMessage: input.errorMessage ?? existing.errorMessage,
  });
}

/** Completion requires every requested format to have a verified artifact id. */
export function pipelineHasCompleteArtifacts(job: DocumentPipelineJob): boolean {
  if (job.status !== "completed") return false;
  if (job.requestedFormats.length === 0) return false;
  if (job.artifactIds.length < job.requestedFormats.length) return false;
  if (job.completionEvidenceIds.length < job.requestedFormats.length) return false;
  if (job.checksums.length < job.requestedFormats.length) return false;
  if (job.byteSizes.some((n) => !Number.isFinite(n) || n <= 0)) return false;
  for (const format of job.requestedFormats) {
    if (!job.completedFormats.includes(format)) return false;
  }
  return true;
}

import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

import type {
  ClaimJobResult,
  JobMetrics24h,
  JobPushStatus,
  JobRecord,
  JobStatus,
  JobStepEvidence,
} from "./types";

const TABLE = "atlas_automation_jobs" as const;

/** Running jobs without heartbeat for this long are treated as hung. */
export const JOB_HANG_TIMEOUT_MS = 30 * 60 * 1000;

type DbRow = {
  id: string;
  user_id: string;
  automation_id: string | null;
  job_type: string;
  status: string;
  scheduled_at: string | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  current_step: string | null;
  progress_percent: number;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  result_summary: string | null;
  artifact_id: string | null;
  external_result_id: string | null;
  external_result_url: string | null;
  idempotency_key: string;
  push_status: string;
  auto_recovered: boolean;
  steps: JobStepEvidence[] | null;
  created_at: string;
  updated_at: string;
};

function getMemoryStore(): Map<string, JobRecord> {
  const scope = globalThis as typeof globalThis & {
    __atlasAutomationJobs?: Map<string, JobRecord>;
  };
  if (!scope.__atlasAutomationJobs) {
    scope.__atlasAutomationJobs = new Map();
  }
  return scope.__atlasAutomationJobs;
}

function memoryByIdempotency(key: string): JobRecord | null {
  for (const row of getMemoryStore().values()) {
    if (row.idempotencyKey === key) return row;
  }
  return null;
}

function rowToRecord(row: DbRow): JobRecord {
  return {
    id: row.id,
    userId: row.user_id,
    automationId: row.automation_id,
    jobType: row.job_type,
    status: row.status as JobStatus,
    scheduledAt: row.scheduled_at,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    currentStep: row.current_step,
    progressPercent: row.progress_percent,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextRetryAt: row.next_retry_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    resultSummary: row.result_summary,
    artifactId: row.artifact_id,
    externalResultId: row.external_result_id,
    externalResultUrl: row.external_result_url,
    idempotencyKey: row.idempotency_key,
    pushStatus: row.push_status as JobPushStatus,
    autoRecovered: row.auto_recovered,
    steps: Array.isArray(row.steps) ? row.steps : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordToRow(record: Partial<JobRecord> & { id: string; userId: string; idempotencyKey: string }): DbRow {
  const now = new Date().toISOString();
  return {
    id: record.id,
    user_id: record.userId,
    automation_id: record.automationId ?? null,
    job_type: record.jobType ?? "automation",
    status: record.status ?? "queued",
    scheduled_at: record.scheduledAt ?? null,
    queued_at: record.queuedAt ?? null,
    started_at: record.startedAt ?? null,
    completed_at: record.completedAt ?? null,
    failed_at: record.failedAt ?? null,
    current_step: record.currentStep ?? null,
    progress_percent: record.progressPercent ?? 0,
    attempt_count: record.attemptCount ?? 0,
    max_attempts: record.maxAttempts ?? 3,
    next_retry_at: record.nextRetryAt ?? null,
    last_error_code: record.lastErrorCode ?? null,
    last_error_message: record.lastErrorMessage ?? null,
    result_summary: record.resultSummary ?? null,
    artifact_id: record.artifactId ?? null,
    external_result_id: record.externalResultId ?? null,
    external_result_url: record.externalResultUrl ?? null,
    idempotency_key: record.idempotencyKey,
    push_status: record.pushStatus ?? "pending",
    auto_recovered: record.autoRecovered ?? false,
    steps: record.steps ?? [],
    created_at: record.createdAt ?? now,
    updated_at: record.updatedAt ?? now,
  };
}

function isTerminalStatus(status: JobStatus): boolean {
  return (
    status === "completed" ||
    status === "partially_completed" ||
    status === "failed" ||
    status === "cancelled"
  );
}

function isStaleRunning(record: JobRecord, nowMs = Date.now()): boolean {
  if (record.status !== "running") return false;
  const updatedMs = new Date(record.updatedAt).getTime();
  return nowMs - updatedMs > JOB_HANG_TIMEOUT_MS;
}

function resolveClaim(existing: JobRecord, nowMs = Date.now()): ClaimJobResult {
  if (
    existing.status === "completed" ||
    existing.status === "partially_completed" ||
    existing.status === "failed" ||
    existing.status === "cancelled"
  ) {
    return { action: "skip", record: existing, reason: "already_terminal" };
  }

  if (existing.status === "queued") {
    return { action: "skip", record: existing, reason: "already_queued" };
  }

  if (existing.status === "running" && !isStaleRunning(existing, nowMs)) {
    return { action: "skip", record: existing, reason: "already_running" };
  }

  if (
    existing.status === "retrying" &&
    existing.nextRetryAt &&
    existing.nextRetryAt > new Date(nowMs).toISOString()
  ) {
    return { action: "skip", record: existing, reason: "retry_not_due" };
  }

  return { action: "resume", record: existing };
}

export async function claimAutomationJob(input: {
  id: string;
  userId: string;
  automationId: string | null;
  idempotencyKey: string;
  jobType?: string;
  scheduledAt?: string | null;
  maxAttempts?: number;
}): Promise<ClaimJobResult> {
  const now = new Date().toISOString();
  const client = createServiceRoleClientIfConfigured();

  if (!client) {
    const existing = memoryByIdempotency(input.idempotencyKey);
    if (existing) return resolveClaim(existing);
    const record: JobRecord = {
      id: input.id,
      userId: input.userId,
      automationId: input.automationId,
      jobType: input.jobType ?? "automation",
      status: "queued",
      scheduledAt: input.scheduledAt ?? null,
      queuedAt: now,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      currentStep: null,
      progressPercent: 0,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      resultSummary: null,
      artifactId: null,
      externalResultId: null,
      externalResultUrl: null,
      idempotencyKey: input.idempotencyKey,
      pushStatus: "pending",
      autoRecovered: false,
      steps: [],
      createdAt: now,
      updatedAt: now,
    };
    getMemoryStore().set(input.id, record);
    return { action: "created", record };
  }

  try {
    const { data, error } = await client
      .from(TABLE)
      .insert(
        recordToRow({
          id: input.id,
          userId: input.userId,
          automationId: input.automationId,
          idempotencyKey: input.idempotencyKey,
          jobType: input.jobType ?? "automation",
          status: "queued",
          scheduledAt: input.scheduledAt ?? null,
          queuedAt: now,
          maxAttempts: input.maxAttempts ?? 3,
        }),
      )
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: existingRow } = await client
          .from(TABLE)
          .select("*")
          .eq("idempotency_key", input.idempotencyKey)
          .maybeSingle();
        if (existingRow) {
          return resolveClaim(rowToRecord(existingRow as DbRow));
        }
      }
      console.warn("[jobs] claim insert failed:", error.message);
      throw new Error(error.message);
    }

    return { action: "created", record: rowToRecord(data as DbRow) };
  } catch (error) {
    console.warn("[jobs] claim skipped, using memory fallback");
    const existing = memoryByIdempotency(input.idempotencyKey);
    if (existing) return resolveClaim(existing);
    throw error;
  }
}

export async function getJobRecord(
  jobId: string,
  userId: string,
): Promise<JobRecord | null> {
  const client = createServiceRoleClientIfConfigured();
  if (!client) {
    const row = getMemoryStore().get(jobId);
    return row && row.userId === userId ? row : null;
  }

  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    const mem = getMemoryStore().get(jobId);
    return mem && mem.userId === userId ? mem : null;
  }
  return rowToRecord(data as DbRow);
}

export async function upsertJobRecord(record: JobRecord): Promise<JobRecord> {
  const now = new Date().toISOString();
  const next = { ...record, updatedAt: now };
  const client = createServiceRoleClientIfConfigured();

  if (!client) {
    getMemoryStore().set(next.id, next);
    return next;
  }

  const { data, error } = await client
    .from(TABLE)
    .upsert(recordToRow(next), { onConflict: "id" })
    .select("*")
    .single();

  if (error || !data) {
    console.warn("[jobs] upsert failed:", error?.message);
    getMemoryStore().set(next.id, next);
    return next;
  }
  return rowToRecord(data as DbRow);
}

export async function listDueRetries(nowMs = Date.now()): Promise<JobRecord[]> {
  const now = new Date(nowMs).toISOString();
  const client = createServiceRoleClientIfConfigured();

  if (!client) {
    return [...getMemoryStore().values()].filter(
      (job) =>
        job.status === "retrying" &&
        job.nextRetryAt != null &&
        job.nextRetryAt <= now,
    );
  }

  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("status", "retrying")
    .lte("next_retry_at", now)
    .order("next_retry_at", { ascending: true })
    .limit(50);

  if (error || !Array.isArray(data)) {
    return [...getMemoryStore().values()].filter(
      (job) =>
        job.status === "retrying" &&
        job.nextRetryAt != null &&
        job.nextRetryAt <= now,
    );
  }
  return data.map((row) => rowToRecord(row as DbRow));
}

export async function listStaleRunningJobs(
  nowMs = Date.now(),
): Promise<JobRecord[]> {
  const cutoff = new Date(nowMs - JOB_HANG_TIMEOUT_MS).toISOString();
  const client = createServiceRoleClientIfConfigured();

  if (!client) {
    return [...getMemoryStore().values()].filter(
      (job) => job.status === "running" && job.updatedAt <= cutoff,
    );
  }

  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("status", "running")
    .lte("updated_at", cutoff)
    .limit(50);

  if (error || !Array.isArray(data)) {
    return [...getMemoryStore().values()].filter(
      (job) => job.status === "running" && job.updatedAt <= cutoff,
    );
  }
  return data.map((row) => rowToRecord(row as DbRow));
}

export async function getJobMetrics24h(): Promise<JobMetrics24h> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const client = createServiceRoleClientIfConfigured();
  const empty: JobMetrics24h = {
    total: 0,
    completed: 0,
    failed: 0,
    retrying: 0,
    recovered: 0,
    hung: 0,
    dedupeSkips: 0,
    pushOk: 0,
    pushFailed: 0,
    pushInvalidDevices: 0,
    generatedAt: new Date().toISOString(),
  };

  if (!client) {
    const rows = [...getMemoryStore().values()].filter(
      (r) => r.createdAt >= since,
    );
    return aggregateMetrics(rows, empty);
  }

  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .gte("created_at", since);

  if (error || !Array.isArray(data)) return empty;
  return aggregateMetrics(data.map((r) => rowToRecord(r as DbRow)), empty);
}

function aggregateMetrics(rows: JobRecord[], base: JobMetrics24h): JobMetrics24h {
  const metrics = { ...base, total: rows.length };
  for (const row of rows) {
    if (row.status === "completed" || row.status === "partially_completed") {
      metrics.completed += 1;
    }
    if (row.status === "failed") metrics.failed += 1;
    if (row.status === "retrying") metrics.retrying += 1;
    if (row.autoRecovered) metrics.recovered += 1;
    if (row.lastErrorCode === "hang_timeout") metrics.hung += 1;
    if (row.pushStatus === "sent") metrics.pushOk += 1;
    if (row.pushStatus === "failed") metrics.pushFailed += 1;
  }
  return metrics;
}

export function resetAutomationJobStoreForTests(): void {
  getMemoryStore().clear();
}

export { isStaleRunning, isTerminalStatus, resolveClaim };

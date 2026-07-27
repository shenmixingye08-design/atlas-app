/**
 * Cross-stage pipeline logs for Word runtime (jobId-correlated).
 * Never log body text, API keys, tokens, cookies, or PII payloads.
 */

export type WorkPipelineStage =
  | "WORK_REQUEST_RECEIVED"
  | "FORMAT_DETECTED"
  | "AI_CONTENT_STARTED"
  | "AI_CONTENT_COMPLETED"
  | "DOCX_PARSE_STARTED"
  | "DOCX_PARSE_COMPLETED"
  | "DOCX_PACK_STARTED"
  | "DOCX_PACK_COMPLETED"
  | "DOCX_VERIFY_STARTED"
  | "DOCX_VERIFY_COMPLETED"
  | "DOCX_STORE_STARTED"
  | "DOCX_STORE_COMPLETED"
  | "DOCX_METADATA_CREATED"
  | "DOCX_DOWNLOAD_READY"
  | "WORK_COMPLETED"
  | "NOTIFICATION_SENT"
  | "PIPELINE_FAILED";

export type WorkPipelineContext = {
  jobId?: string | null;
  workflowId?: string | null;
  userId?: string | null;
  format?: string | null;
  attempt?: number | null;
  deliverableId?: string | null;
  generatedFileSize?: number | null;
  durationMs?: number | null;
};

export type WorkPipelineLogEntry = {
  id: string;
  stage: WorkPipelineStage;
  ok: boolean;
  at: string;
  jobId: string | null;
  workflowId: string | null;
  userId: string | null;
  format: string | null;
  attempt: number | null;
  deliverableId: string | null;
  generatedFileSize: number | null;
  durationMs: number | null;
  errorName?: string | null;
  errorMessage?: string | null;
  stack?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
};

const MAX_LOGS = 2000;

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __minervotWorkPipelineLogs?: WorkPipelineLogEntry[];
  };
}

function getLogs(): WorkPipelineLogEntry[] {
  const scope = getGlobalScope();
  if (!scope.__minervotWorkPipelineLogs) {
    scope.__minervotWorkPipelineLogs = [];
  }
  return scope.__minervotWorkPipelineLogs;
}

function push(entry: WorkPipelineLogEntry): WorkPipelineLogEntry {
  const logs = getLogs();
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  return entry;
}

export function logWorkPipeline(
  stage: Exclude<WorkPipelineStage, "PIPELINE_FAILED">,
  context: WorkPipelineContext = {},
  metadata?: Readonly<Record<string, unknown>>,
): WorkPipelineLogEntry {
  const entry: WorkPipelineLogEntry = {
    id: `pipe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    stage,
    ok: true,
    at: new Date().toISOString(),
    jobId: context.jobId ?? null,
    workflowId: context.workflowId ?? null,
    userId: context.userId ?? null,
    format: context.format ?? null,
    attempt: context.attempt ?? null,
    deliverableId: context.deliverableId ?? null,
    generatedFileSize: context.generatedFileSize ?? null,
    durationMs: context.durationMs ?? null,
    ...(metadata ? { metadata } : {}),
  };
  push(entry);
  console.info(`[work-pipeline] ${stage}`, {
    jobId: entry.jobId,
    workflowId: entry.workflowId,
    userId: entry.userId,
    format: entry.format,
    attempt: entry.attempt,
    deliverableId: entry.deliverableId,
    generatedFileSize: entry.generatedFileSize,
    durationMs: entry.durationMs,
    ...(metadata ?? {}),
  });
  return entry;
}

export function logWorkPipelineFailure(
  stage: string,
  error: unknown,
  context: WorkPipelineContext = {},
  metadata?: Readonly<Record<string, unknown>>,
): WorkPipelineLogEntry {
  const err = error instanceof Error ? error : null;
  const entry: WorkPipelineLogEntry = {
    id: `pipe_err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    stage: "PIPELINE_FAILED",
    ok: false,
    at: new Date().toISOString(),
    jobId: context.jobId ?? null,
    workflowId: context.workflowId ?? null,
    userId: context.userId ?? null,
    format: context.format ?? null,
    attempt: context.attempt ?? null,
    deliverableId: context.deliverableId ?? null,
    generatedFileSize: context.generatedFileSize ?? null,
    durationMs: context.durationMs ?? null,
    errorName: err?.name ?? "Error",
    errorMessage: err?.message ?? String(error ?? "unknown"),
    stack: err?.stack ?? null,
    metadata: {
      failedStage: stage,
      ...(metadata ?? {}),
    },
  };
  push(entry);
  console.error("[work-pipeline] FAILURE", {
    stage,
    jobId: entry.jobId,
    workflowId: entry.workflowId,
    userId: entry.userId,
    format: entry.format,
    attempt: entry.attempt,
    errorName: entry.errorName,
    errorMessage: entry.errorMessage,
    stack: entry.stack,
    durationMs: entry.durationMs,
    generatedFileSize: entry.generatedFileSize,
    deliverableId: entry.deliverableId,
    timestamp: entry.at,
  });
  return entry;
}

export function listWorkPipelineLogs(limit = 100): WorkPipelineLogEntry[] {
  return getLogs().slice(0, limit);
}

export function listWorkPipelineLogsForJob(
  jobId: string,
  limit = 100,
): WorkPipelineLogEntry[] {
  return getLogs()
    .filter((entry) => entry.jobId === jobId)
    .slice(0, limit);
}

export function resetWorkPipelineLogsForTests(): void {
  getGlobalScope().__minervotWorkPipelineLogs = [];
}

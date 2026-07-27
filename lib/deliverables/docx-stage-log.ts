/**
 * Stage logging for Word (.docx) pipeline.
 * Every stage must be observable; failures store job/workflow/user/stack.
 */

export type DocxStage =
  | "DOCX_PARSE_STARTED"
  | "DOCX_PARSE_COMPLETED"
  | "DOCX_PACK_STARTED"
  | "DOCX_PACK_COMPLETED"
  | "DOCX_VERIFY_STARTED"
  | "DOCX_VERIFY_COMPLETED"
  | "DOCX_STORE_STARTED"
  | "DOCX_STORE_COMPLETED"
  | "DOCX_METADATA_CREATED"
  | "DOCX_DOWNLOAD_READY";

export type DocxStageLogEntry = {
  id: string;
  stage: DocxStage | "DOCX_STAGE_FAILED";
  ok: boolean;
  at: string;
  jobId: string | null;
  workflowId: string | null;
  userId: string | null;
  message?: string;
  error?: string | null;
  stack?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
};

export type DocxStageContext = {
  jobId?: string | null;
  workflowId?: string | null;
  userId?: string | null;
};

const MAX_LOGS = 1000;

function getGlobalScope() {
  return globalThis as typeof globalThis & {
    __minervotDocxStageLogs?: DocxStageLogEntry[];
  };
}

function getLogs(): DocxStageLogEntry[] {
  const scope = getGlobalScope();
  if (!scope.__minervotDocxStageLogs) {
    scope.__minervotDocxStageLogs = [];
  }
  return scope.__minervotDocxStageLogs;
}

export function logDocxStage(
  stage: DocxStage,
  context: DocxStageContext = {},
  metadata?: Readonly<Record<string, unknown>>,
): DocxStageLogEntry {
  const entry: DocxStageLogEntry = {
    id: `docx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    stage,
    ok: true,
    at: new Date().toISOString(),
    jobId: context.jobId ?? null,
    workflowId: context.workflowId ?? null,
    userId: context.userId ?? null,
    ...(metadata ? { metadata } : {}),
  };
  const logs = getLogs();
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  console.info(`[docx-stage] ${stage}`, {
    jobId: entry.jobId,
    workflowId: entry.workflowId,
    userId: entry.userId,
    ...(metadata ?? {}),
  });
  return entry;
}

export function logDocxStageFailure(
  stage: DocxStage | string,
  error: unknown,
  context: DocxStageContext = {},
  metadata?: Readonly<Record<string, unknown>>,
): DocxStageLogEntry {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "unknown");
  const stack = error instanceof Error ? error.stack ?? null : null;
  const entry: DocxStageLogEntry = {
    id: `docx_err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    stage: "DOCX_STAGE_FAILED",
    ok: false,
    at: new Date().toISOString(),
    jobId: context.jobId ?? null,
    workflowId: context.workflowId ?? null,
    userId: context.userId ?? null,
    message: `stage=${stage}`,
    error: message,
    stack,
    metadata: {
      failedStage: stage,
      ...(metadata ?? {}),
    },
  };
  const logs = getLogs();
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  console.error("[docx-stage] FAILURE", {
    stage,
    jobId: entry.jobId,
    workflowId: entry.workflowId,
    userId: entry.userId,
    error: message,
    stack,
    timestamp: entry.at,
    ...(metadata ?? {}),
  });
  return entry;
}

export function listDocxStageLogs(limit = 50): DocxStageLogEntry[] {
  return getLogs().slice(0, limit);
}

export function resetDocxStageLogsForTests(): void {
  getGlobalScope().__minervotDocxStageLogs = [];
}

import "server-only";

import {
  type VisionPipelineStage,
  isVisionPipelineStage,
} from "@/lib/vision/failure-stage";
import {
  loadVisionDiagnosticDurable,
  persistVisionDiagnosticDurable,
} from "@/lib/vision/diagnostics-durable";
import { readVercelRequestId } from "@/lib/runtime/vercel-request-id";

export type VisionDiagnosticStage = VisionPipelineStage;

export type VisionDiagnosticRecord = {
  id: string;
  userId: string;
  attachmentId: string | null;
  jobId: string | null;
  stages: Array<{
    stage: VisionDiagnosticStage;
    ok: boolean;
    at: string;
    detail?: Record<string, string | number | boolean | null>;
  }>;
  model: string | null;
  mimeType: string | null;
  downloadedByteLength: number | null;
  base64Length: number | null;
  imageByteLength: number | null;
  imageCount: number | null;
  urlLength: number | null;
  inputImageIncluded: boolean | null;
  analysisSuccess: boolean | null;
  payloadAttachmentIds: string[] | null;
  detectedType: string | null;
  artifactGate: string | null;
  failedStage: VisionDiagnosticStage | null;
  lastErrorCode: string | null;
  lastUserCode: string | null;
  /** OpenAI request id (x-request-id / req_…). */
  openaiRequestId: string | null;
  /** Vercel request id (x-vercel-id). */
  vercelRequestId: string | null;
  /** Full OpenAI error JSON (secrets redacted). */
  openaiErrorBody: string | null;
  openaiHttpStatus: number | null;
  openaiErrorType: string | null;
  openaiErrorCode: string | null;
  openaiErrorMessage: string | null;
  /** Where the durable copy was last written. */
  supabasePersist: "pending" | "ok" | "skipped" | null;
  createdAt: string;
  updatedAt: string;
};

const store = new Map<string, VisionDiagnosticRecord>();

function scheduleDurablePersist(record: VisionDiagnosticRecord): void {
  void persistVisionDiagnosticDurable(record)
    .then((result) => {
      const current = store.get(record.id);
      if (!current) return;
      current.supabasePersist = result === "supabase" ? "ok" : "skipped";
      current.updatedAt = new Date().toISOString();
    })
    .catch(() => {
      const current = store.get(record.id);
      if (current) current.supabasePersist = "skipped";
    });
}

/** Safe server log — never includes image bytes, URLs, or extracted PII text. */
export function logVisionStage(input: {
  diagnosticId?: string | null;
  attachmentId?: string | null;
  jobId?: string | null;
  stage: VisionDiagnosticStage;
  ok: boolean;
  downloadedByteLength?: number;
  mimeType?: string;
  base64Length?: number;
  imageByteLength?: number;
  imageCount?: number | null;
  urlLength?: number | null;
  model?: string;
  openaiErrorCode?: string;
  openaiErrorType?: string;
  httpStatus?: number | null;
  param?: string | null;
  requestId?: string | null;
  openaiRequestId?: string | null;
  vercelRequestId?: string | null;
  safeMessage?: string | null;
  rawErrorBody?: string | null;
  inputTypes?: string | null;
  timedOut?: boolean | null;
  apiFormat?: string | null;
  responseStatus?: string | null;
  errorCode?: string;
  userCode?: string;
  durationMs?: number;
}): void {
  console.info("[vision]", {
    diagnosticId: input.diagnosticId ?? null,
    attachmentId: input.attachmentId ?? null,
    jobId: input.jobId ?? null,
    stage: input.stage,
    storageDownloadSuccess:
      input.stage === "storage_download" ? input.ok : undefined,
    downloadedByteLength: input.downloadedByteLength,
    mimeType: input.mimeType,
    base64Length: input.base64Length,
    imageByteLength: input.imageByteLength,
    imageCount: input.imageCount ?? null,
    urlLength: input.urlLength ?? null,
    model: input.model,
    openaiErrorCode: input.openaiErrorCode,
    openaiErrorType: input.openaiErrorType,
    httpStatus: input.httpStatus ?? null,
    param: input.param ?? null,
    requestId: input.requestId ?? input.openaiRequestId ?? null,
    openaiRequestId: input.openaiRequestId ?? input.requestId ?? null,
    vercelRequestId: input.vercelRequestId ?? null,
    safeMessage: input.safeMessage ?? null,
    rawErrorBody: input.rawErrorBody ?? null,
    inputTypes: input.inputTypes ?? null,
    timedOut: input.timedOut ?? null,
    apiFormat: input.apiFormat ?? null,
    responseStatus: input.responseStatus ?? null,
    errorCode: input.errorCode ?? null,
    userCode: input.userCode ?? null,
    durationMs: input.durationMs ?? null,
    ok: input.ok,
  });
}

export function createVisionDiagnostic(input: {
  userId: string;
  attachmentId?: string | null;
  jobId?: string | null;
  vercelRequestId?: string | null;
}): VisionDiagnosticRecord {
  const now = new Date().toISOString();
  const record: VisionDiagnosticRecord = {
    id: `vdiag_${crypto.randomUUID().replace(/-/g, "").slice(0, 14)}`,
    userId: input.userId,
    attachmentId: input.attachmentId ?? null,
    jobId: input.jobId ?? null,
    stages: [],
    model: null,
    mimeType: null,
    downloadedByteLength: null,
    base64Length: null,
    imageByteLength: null,
    imageCount: null,
    urlLength: null,
    inputImageIncluded: null,
    analysisSuccess: null,
    payloadAttachmentIds: null,
    detectedType: null,
    artifactGate: null,
    failedStage: null,
    lastErrorCode: null,
    lastUserCode: null,
    openaiRequestId: null,
    vercelRequestId: input.vercelRequestId ?? null,
    openaiErrorBody: null,
    openaiHttpStatus: null,
    openaiErrorType: null,
    openaiErrorCode: null,
    openaiErrorMessage: null,
    supabasePersist: "pending",
    createdAt: now,
    updatedAt: now,
  };
  store.set(record.id, record);
  console.info("[vision]", {
    diagnosticId: record.id,
    attachmentId: record.attachmentId,
    jobId: record.jobId,
    vercelRequestId: record.vercelRequestId,
    stage: "upload",
    event: "diagnostic_created",
    ok: true,
  });

  // Capture Vercel id asynchronously when not provided (Route Handler context).
  if (!record.vercelRequestId) {
    void readVercelRequestId().then((id) => {
      const current = store.get(record.id);
      if (!current || current.vercelRequestId || !id) return;
      current.vercelRequestId = id;
      current.updatedAt = new Date().toISOString();
      scheduleDurablePersist(current);
    });
  } else {
    scheduleDurablePersist(record);
  }

  return record;
}

export function appendVisionDiagnosticStage(
  id: string,
  stage: VisionDiagnosticStage,
  ok: boolean,
  detail?: Record<string, string | number | boolean | null>,
): void {
  const record = store.get(id);
  if (!record) {
    console.warn("[vision]", {
      diagnosticId: id,
      stage,
      ok,
      event: "diagnostic_missing",
    });
    return;
  }
  record.stages.push({
    stage,
    ok,
    at: new Date().toISOString(),
    ...(detail ? { detail } : {}),
  });
  if (typeof detail?.downloadedByteLength === "number") {
    record.downloadedByteLength = detail.downloadedByteLength;
  }
  if (typeof detail?.mimeType === "string") {
    record.mimeType = detail.mimeType;
  }
  if (typeof detail?.base64Length === "number") {
    record.base64Length = detail.base64Length;
  }
  if (typeof detail?.imageByteLength === "number") {
    record.imageByteLength = detail.imageByteLength;
  }
  if (typeof detail?.imageCount === "number") {
    record.imageCount = detail.imageCount;
  }
  if (typeof detail?.urlLength === "number") {
    record.urlLength = detail.urlLength;
  }
  if (typeof detail?.model === "string") {
    record.model = detail.model;
  }
  if (typeof detail?.inputImageIncluded === "boolean") {
    record.inputImageIncluded = detail.inputImageIncluded;
  }
  if (typeof detail?.analysisSuccess === "boolean") {
    record.analysisSuccess = detail.analysisSuccess;
  }
  if (typeof detail?.detectedType === "string") {
    record.detectedType = detail.detectedType;
  }
  if (typeof detail?.artifactGate === "string") {
    record.artifactGate = detail.artifactGate;
  }
  if (typeof detail?.payloadAttachmentIdCount === "number") {
    // Count only — never store filename substitutes.
    record.payloadAttachmentIds = Array.from(
      { length: detail.payloadAttachmentIdCount },
      (_, index) => `id_${index + 1}`,
    );
  }
  if (typeof detail?.requestId === "string") {
    record.openaiRequestId = detail.requestId;
  }
  if (typeof detail?.openaiRequestId === "string") {
    record.openaiRequestId = detail.openaiRequestId;
  }
  if (typeof detail?.vercelRequestId === "string") {
    record.vercelRequestId = detail.vercelRequestId;
  }
  if (typeof detail?.rawErrorBody === "string") {
    record.openaiErrorBody = detail.rawErrorBody;
  }
  if (typeof detail?.httpStatus === "number") {
    record.openaiHttpStatus = detail.httpStatus;
  }
  if (typeof detail?.openaiErrorType === "string") {
    record.openaiErrorType = detail.openaiErrorType;
  }
  if (typeof detail?.openaiErrorCode === "string") {
    record.openaiErrorCode = detail.openaiErrorCode;
  }
  if (typeof detail?.safeMessage === "string") {
    record.openaiErrorMessage = detail.safeMessage;
  }
  if (!ok) {
    record.failedStage = stage;
    if (typeof detail?.errorCode === "string") {
      record.lastErrorCode = detail.errorCode;
    } else if (typeof detail?.openaiErrorCode === "string") {
      record.lastErrorCode = detail.openaiErrorCode;
    }
    if (typeof detail?.userCode === "string") {
      record.lastUserCode = detail.userCode;
    }
  }
  record.updatedAt = new Date().toISOString();
  logVisionStage({
    diagnosticId: record.id,
    attachmentId: record.attachmentId,
    jobId:
      typeof detail?.jobId === "string"
        ? detail.jobId
        : record.jobId,
    stage,
    ok,
    downloadedByteLength: record.downloadedByteLength ?? undefined,
    mimeType: record.mimeType ?? undefined,
    base64Length: record.base64Length ?? undefined,
    imageByteLength: record.imageByteLength ?? undefined,
    imageCount: record.imageCount,
    urlLength: record.urlLength,
    model: record.model ?? undefined,
    openaiErrorCode:
      typeof detail?.openaiErrorCode === "string"
        ? detail.openaiErrorCode
        : undefined,
    openaiErrorType:
      typeof detail?.openaiErrorType === "string"
        ? detail.openaiErrorType
        : undefined,
    httpStatus:
      typeof detail?.httpStatus === "number" ? detail.httpStatus : null,
    param: typeof detail?.param === "string" ? detail.param : null,
    requestId:
      typeof detail?.requestId === "string"
        ? detail.requestId
        : record.openaiRequestId,
    openaiRequestId: record.openaiRequestId,
    vercelRequestId: record.vercelRequestId,
    safeMessage:
      typeof detail?.safeMessage === "string" ? detail.safeMessage : null,
    rawErrorBody:
      typeof detail?.rawErrorBody === "string" ? detail.rawErrorBody : null,
    inputTypes:
      typeof detail?.inputTypes === "string" ? detail.inputTypes : null,
    timedOut:
      typeof detail?.timedOut === "boolean" ? detail.timedOut : null,
    apiFormat:
      typeof detail?.apiFormat === "string" ? detail.apiFormat : null,
    responseStatus:
      typeof detail?.responseStatus === "string"
        ? detail.responseStatus
        : null,
    errorCode:
      typeof detail?.errorCode === "string" ? detail.errorCode : undefined,
    userCode:
      typeof detail?.userCode === "string" ? detail.userCode : undefined,
    durationMs:
      typeof detail?.durationMs === "number" ? detail.durationMs : undefined,
  });
  scheduleDurablePersist(record);
}

export function getLatestFailedStage(
  record: VisionDiagnosticRecord,
): VisionDiagnosticStage | null {
  if (record.failedStage && isVisionPipelineStage(record.failedStage)) {
    return record.failedStage;
  }
  for (let i = record.stages.length - 1; i >= 0; i -= 1) {
    const row = record.stages[i];
    if (row && !row.ok) return row.stage;
  }
  return null;
}

export function getVisionDiagnosticForUser(
  userId: string,
  id: string,
): VisionDiagnosticRecord | null {
  const record = store.get(id);
  if (!record || record.userId !== userId) return null;
  return record;
}

/** Memory first, then Supabase durable (cross-instance / cold start). */
export async function getVisionDiagnosticForUserDurable(
  userId: string,
  id: string,
): Promise<VisionDiagnosticRecord | null> {
  const memory = getVisionDiagnosticForUser(userId, id);
  if (memory) return memory;
  const durable = await loadVisionDiagnosticDurable(userId, id);
  if (durable) {
    store.set(durable.id, durable);
  }
  return durable;
}

export function listRecentVisionDiagnosticsForUser(
  userId: string,
  limit = 10,
): VisionDiagnosticRecord[] {
  return Array.from(store.values())
    .filter((row) => row.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

/** Test helper — clear in-memory diagnostics. */
export function resetVisionDiagnosticsForTests(): void {
  store.clear();
}

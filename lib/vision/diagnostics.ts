import "server-only";

export type VisionDiagnosticStage =
  | "upload"
  | "storage_download"
  | "data_url"
  | "vision_request"
  | "vision_response"
  | "schema_validation"
  | "artifact_handoff"
  | "blocked";

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
  inputImageIncluded: boolean | null;
  analysisSuccess: boolean | null;
  payloadAttachmentIds: string[] | null;
  detectedType: string | null;
  artifactGate: string | null;
  createdAt: string;
  updatedAt: string;
};

const store = new Map<string, VisionDiagnosticRecord>();

/** Safe server log — never includes image bytes, URLs, or extracted PII text. */
export function logVisionStage(input: {
  attachmentId?: string | null;
  jobId?: string | null;
  stage: VisionDiagnosticStage;
  ok: boolean;
  downloadedByteLength?: number;
  mimeType?: string;
  base64Length?: number;
  model?: string;
  openaiErrorCode?: string;
  openaiErrorType?: string;
}): void {
  console.info("[vision]", {
    attachmentId: input.attachmentId ?? null,
    jobId: input.jobId ?? null,
    stage: input.stage,
    storageDownloadSuccess:
      input.stage === "storage_download" ? input.ok : undefined,
    downloadedByteLength: input.downloadedByteLength,
    mimeType: input.mimeType,
    base64Length: input.base64Length,
    model: input.model,
    openaiErrorCode: input.openaiErrorCode,
    openaiErrorType: input.openaiErrorType,
    ok: input.ok,
  });
}

export function createVisionDiagnostic(input: {
  userId: string;
  attachmentId?: string | null;
  jobId?: string | null;
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
    inputImageIncluded: null,
    analysisSuccess: null,
    payloadAttachmentIds: null,
    detectedType: null,
    artifactGate: null,
    createdAt: now,
    updatedAt: now,
  };
  store.set(record.id, record);
  return record;
}

export function appendVisionDiagnosticStage(
  id: string,
  stage: VisionDiagnosticStage,
  ok: boolean,
  detail?: Record<string, string | number | boolean | null>,
): void {
  const record = store.get(id);
  if (!record) return;
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
  record.updatedAt = new Date().toISOString();
  logVisionStage({
    attachmentId: record.attachmentId,
    jobId: record.jobId,
    stage,
    ok,
    downloadedByteLength: record.downloadedByteLength ?? undefined,
    mimeType: record.mimeType ?? undefined,
    base64Length: record.base64Length ?? undefined,
    model: record.model ?? undefined,
    openaiErrorCode:
      typeof detail?.openaiErrorCode === "string"
        ? detail.openaiErrorCode
        : undefined,
    openaiErrorType:
      typeof detail?.openaiErrorType === "string"
        ? detail.openaiErrorType
        : undefined,
  });
}

export function getVisionDiagnosticForUser(
  userId: string,
  id: string,
): VisionDiagnosticRecord | null {
  const record = store.get(id);
  if (!record || record.userId !== userId) return null;
  return record;
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

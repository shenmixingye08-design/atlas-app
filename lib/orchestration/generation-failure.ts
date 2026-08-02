/**
 * Structured generation failure — persisted on OrchestrationResult / Project
 * so `/results` can always explain why displayKind became failed.
 */

export type GenerationFailureDiagnostic = {
  failedStage: string;
  errorCode: string;
  userMessage: string;
  developerMessage: string;
  diagnosticId: string;
  requestId: string | null;
  workJobId: string | null;
  commanderRunId: string | null;
  projectId: string | null;
  retryable: boolean;
  timestamp: string;
  openaiRequestId?: string | null;
  storageError?: string | null;
  exportError?: string | null;
  /** Word pipeline stage last known success before failure (if any). */
  lastSuccessStage?: string | null;
};

export function createGenerationFailureDiagnostic(
  input: Omit<GenerationFailureDiagnostic, "diagnosticId" | "timestamp"> & {
    diagnosticId?: string;
    timestamp?: string;
  },
): GenerationFailureDiagnostic {
  return {
    failedStage: input.failedStage,
    errorCode: input.errorCode,
    userMessage: input.userMessage,
    developerMessage: input.developerMessage,
    diagnosticId:
      input.diagnosticId ??
      `gfail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    requestId: input.requestId ?? null,
    workJobId: input.workJobId ?? null,
    commanderRunId: input.commanderRunId ?? null,
    projectId: input.projectId ?? null,
    retryable: input.retryable,
    timestamp: input.timestamp ?? new Date().toISOString(),
    openaiRequestId: input.openaiRequestId ?? null,
    storageError: input.storageError ?? null,
    exportError: input.exportError ?? null,
    lastSuccessStage: input.lastSuccessStage ?? null,
  };
}

/** Map Word export failure reason → failedStage for pipeline forensics. */
export function mapWordExportReasonToStage(reason: string): {
  failedStage: string;
  errorCode: string;
  lastSuccessStage: string | null;
  retryable: boolean;
} {
  const r = reason.toLowerCase();
  if (/word_export_empty_content|empty_content|ai_content_empty/.test(r)) {
    return {
      failedStage: "WORD_CONTENT_GENERATED",
      errorCode: "word_export_empty_content",
      lastSuccessStage: "WORD_EXPORT_STARTED",
      retryable: true,
    };
  }
  if (/unsafe_export|assertSafeExport/.test(r)) {
    return {
      failedStage: "WORD_CONTENT_GENERATED",
      errorCode: "unsafe_export_text",
      lastSuccessStage: "WORD_EXPORT_STARTED",
      retryable: false,
    };
  }
  if (/docx_not_produced|docx_packer|packer/.test(r)) {
    return {
      failedStage: "DOCX_BINARY_CREATED",
      errorCode: "docx_not_produced",
      lastSuccessStage: "WORD_CONTENT_GENERATED",
      retryable: true,
    };
  }
  if (/docx_verify|ooxml|pk.?header|integrity/.test(r)) {
    return {
      failedStage: "DOCX_VALIDATED",
      errorCode: "docx_validation_failed",
      lastSuccessStage: "DOCX_BINARY_CREATED",
      retryable: true,
    };
  }
  if (/storage_failed|storage_upload|fault_inject:storage/.test(r)) {
    return {
      failedStage: "STORAGE_UPLOAD",
      errorCode: "storage_failed",
      lastSuccessStage: "DOCX_VALIDATED",
      retryable: true,
    };
  }
  if (/db_upsert|metadata|atlas_deliverable_files/.test(r)) {
    return {
      failedStage: "ARTIFACT_METADATA_SAVED",
      errorCode: "metadata_save_failed",
      lastSuccessStage: "STORAGE_UPLOAD",
      retryable: true,
    };
  }
  if (/docx_download_url_invalid/.test(r)) {
    return {
      failedStage: "STORAGE_UPLOAD",
      errorCode: "docx_download_url_invalid",
      lastSuccessStage: "DOCX_BINARY_CREATED",
      retryable: true,
    };
  }
  if (/timeout|etimedout/.test(r)) {
    return {
      failedStage: "WORD_EXPORT_STARTED",
      errorCode: "word_export_timeout",
      lastSuccessStage: "AI_ORCHESTRATION_COMPLETED",
      retryable: true,
    };
  }
  return {
    failedStage: "WORD_EXPORT",
    errorCode: "word_export_failed",
    lastSuccessStage: "AI_ORCHESTRATION_COMPLETED",
    retryable: true,
  };
}

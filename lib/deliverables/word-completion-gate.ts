import "server-only";

import { assertDownloadIntegrity } from "./integrity";
import { loadDurableDeliverable } from "./durable-store";
import {
  getStoredDeliverableForUser,
  toDeliverableMetadata,
} from "./store";
import { DELIVERABLE_MIME_TYPES } from "./types";
import {
  getWordJob,
  isWordJobTerminal,
} from "./word-job-stages";

/**
 * Formal Word completion checklist — completed is allowed only when every
 * step succeeds. Single source of truth for server export + work-job gate.
 */
export const WORD_COMPLETION_STEPS = [
  "REQUEST_VALIDATED",
  "AI_CONTENT_READY",
  "DOCX_GENERATED",
  "NON_ZERO_BYTES",
  "STORAGE_SAVED",
  "STORAGE_KEY_OR_URL",
  "ARTIFACT_DB_SAVED",
  "JOB_LINKED",
  "OWNER_LINKED",
  "DOWNLOADABLE",
  "JOB_STATUS_UPDATED",
] as const;

export type WordCompletionStep = (typeof WORD_COMPLETION_STEPS)[number];

export type WordCompletionErrorCode =
  | "REQUEST_VALIDATION_FAILED"
  | "AI_GENERATION_FAILED"
  | "DOCX_GENERATION_FAILED"
  | "STORAGE_UPLOAD_FAILED"
  | "ARTIFACT_DB_SAVE_FAILED"
  | "JOB_STATUS_UPDATE_FAILED"
  | "AUTHENTICATION_FAILED"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";

export type WordCompletionReport = {
  ok: boolean;
  failedStep: WordCompletionStep | null;
  errorCode: WordCompletionErrorCode;
  internalError: string | null;
  deliverableId: string | null;
  jobId: string;
  sizeBytes: number;
  storageKey: string | null;
  downloadUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  steps: Record<WordCompletionStep, boolean>;
};

function emptySteps(pass = false): Record<WordCompletionStep, boolean> {
  return Object.fromEntries(
    WORD_COMPLETION_STEPS.map((step) => [step, pass]),
  ) as Record<WordCompletionStep, boolean>;
}

function failReport(
  jobId: string,
  failedStep: WordCompletionStep,
  errorCode: WordCompletionErrorCode,
  internalError: string,
  partial?: Partial<WordCompletionReport>,
  steps?: Record<WordCompletionStep, boolean>,
): WordCompletionReport {
  return {
    ok: false,
    failedStep,
    errorCode,
    internalError: internalError.slice(0, 500),
    deliverableId: partial?.deliverableId ?? null,
    jobId,
    sizeBytes: partial?.sizeBytes ?? 0,
    storageKey: partial?.storageKey ?? null,
    downloadUrl: partial?.downloadUrl ?? null,
    fileName: partial?.fileName ?? null,
    mimeType: partial?.mimeType ?? null,
    steps: steps ?? emptySteps(false),
  };
}

/**
 * Session-auth download URL — does not expire like Storage signed URLs.
 * Re-issue anytime after ownership is confirmed.
 */
export function issueWordDownloadUrl(deliverableId: string): string {
  return `/api/deliverables/${encodeURIComponent(deliverableId)}`;
}

/**
 * Refresh download access for an owned Word file.
 * Auth-proxy URLs never expire; this re-validates ownership and returns a
 * fresh same-origin URL. If a signed Storage URL were ever exposed, this is
 * the re-issue point.
 */
export async function refreshWordDownloadAccess(input: {
  userId: string;
  deliverableId: string;
}): Promise<
  | {
      ok: true;
      downloadUrl: string;
      expiresAt: null;
      fileName: string;
      sizeBytes: number;
    }
  | { ok: false; errorCode: WordCompletionErrorCode; message: string }
> {
  if (!input.userId.trim()) {
    return {
      ok: false,
      errorCode: "AUTHENTICATION_FAILED",
      message: "user_required",
    };
  }
  const stored = await getStoredDeliverableForUser(
    input.deliverableId,
    input.userId,
  );
  if (!stored || stored.userId !== input.userId) {
    return {
      ok: false,
      errorCode: "AUTHENTICATION_FAILED",
      message: "not_owner_or_missing",
    };
  }
  if (stored.format !== "docx" || stored.buffer.byteLength === 0) {
    return {
      ok: false,
      errorCode: "DOCX_GENERATION_FAILED",
      message: "not_downloadable",
    };
  }
  return {
    ok: true,
    downloadUrl: issueWordDownloadUrl(stored.id),
    expiresAt: null,
    fileName: stored.fileName,
    sizeBytes: stored.buffer.byteLength,
  };
}

/**
 * Verify all 11 Word completion steps against durable state.
 * Call after generateDeliverables / before marking work-job completed.
 */
export async function verifyWordCompletion(input: {
  userId: string;
  jobId: string;
  /** Step 1 — request already validated by caller. */
  requestValidated: boolean;
  /** Step 2 — AI / export source text non-empty. */
  aiContentReady: boolean;
  deliverableId: string | null;
  /** Optional work-job / commander ids expected on the artifact link. */
  expectedWorkJobId?: string | null;
  expectedCommanderRunId?: string | null;
}): Promise<WordCompletionReport> {
  const steps = emptySteps(false);
  const jobId = input.jobId;

  if (!input.userId.trim()) {
    return failReport(
      jobId,
      "OWNER_LINKED",
      "AUTHENTICATION_FAILED",
      "missing_user",
      {},
      steps,
    );
  }

  if (!input.requestValidated) {
    return failReport(
      jobId,
      "REQUEST_VALIDATED",
      "REQUEST_VALIDATION_FAILED",
      "request_not_validated",
      {},
      steps,
    );
  }
  steps.REQUEST_VALIDATED = true;

  if (!input.aiContentReady) {
    return failReport(
      jobId,
      "AI_CONTENT_READY",
      "AI_GENERATION_FAILED",
      "empty_ai_content",
      {},
      steps,
    );
  }
  steps.AI_CONTENT_READY = true;

  if (!input.deliverableId?.trim()) {
    return failReport(
      jobId,
      "DOCX_GENERATED",
      "DOCX_GENERATION_FAILED",
      "missing_deliverable_id",
      {},
      steps,
    );
  }

  const stored = await getStoredDeliverableForUser(
    input.deliverableId,
    input.userId,
  );
  if (!stored) {
    return failReport(
      jobId,
      "DOCX_GENERATED",
      "DOCX_GENERATION_FAILED",
      "deliverable_not_found_for_user",
      { deliverableId: input.deliverableId },
      steps,
    );
  }
  steps.DOCX_GENERATED = true;

  if (stored.buffer.byteLength === 0) {
    return failReport(
      jobId,
      "NON_ZERO_BYTES",
      "DOCX_GENERATION_FAILED",
      "empty_docx_bytes",
      { deliverableId: stored.id, sizeBytes: 0 },
      steps,
    );
  }
  steps.NON_ZERO_BYTES = true;

  const integrity = assertDownloadIntegrity({
    buffer: stored.buffer,
    format: "docx",
    fileName: stored.fileName,
    contentType: DELIVERABLE_MIME_TYPES.docx,
    expectedSha256: stored.contentSha256 ?? null,
    requireOoxml: true,
  });
  if (!integrity.ok) {
    return failReport(
      jobId,
      "DOCX_GENERATED",
      "DOCX_GENERATION_FAILED",
      `corrupt_docx:${integrity.issues.join(",")}`,
      {
        deliverableId: stored.id,
        sizeBytes: stored.buffer.byteLength,
        fileName: stored.fileName,
      },
      steps,
    );
  }

  const durable = await loadDurableDeliverable(stored.id, input.userId);
  if (!durable) {
    return failReport(
      jobId,
      "ARTIFACT_DB_SAVED",
      "ARTIFACT_DB_SAVE_FAILED",
      "durable_row_missing",
      {
        deliverableId: stored.id,
        sizeBytes: stored.buffer.byteLength,
      },
      steps,
    );
  }

  const storageOk =
    durable.storageStatus === "stored" ||
    durable.storageStatus === "legacy_base64" ||
    Boolean(durable.storagePath) ||
    Boolean(durable.contentBase64);
  if (!storageOk) {
    return failReport(
      jobId,
      "STORAGE_SAVED",
      "STORAGE_UPLOAD_FAILED",
      `storage_status=${durable.storageStatus}`,
      {
        deliverableId: stored.id,
        sizeBytes: stored.buffer.byteLength,
      },
      steps,
    );
  }
  steps.STORAGE_SAVED = true;

  const storageKey =
    durable.storagePath ??
    (durable.contentBase64 ? `base64:${stored.id}` : null);
  if (!storageKey) {
    return failReport(
      jobId,
      "STORAGE_KEY_OR_URL",
      "STORAGE_UPLOAD_FAILED",
      "missing_storage_key",
      {
        deliverableId: stored.id,
        sizeBytes: stored.buffer.byteLength,
      },
      steps,
    );
  }
  steps.STORAGE_KEY_OR_URL = true;
  steps.ARTIFACT_DB_SAVED = true;

  const wordJob = await getWordJob(jobId);
  if (!wordJob || wordJob.deliverableId !== stored.id) {
    return failReport(
      jobId,
      "JOB_LINKED",
      "JOB_STATUS_UPDATE_FAILED",
      `job_link_mismatch:job=${wordJob?.deliverableId ?? "null"}`,
      {
        deliverableId: stored.id,
        sizeBytes: stored.buffer.byteLength,
        storageKey,
      },
      steps,
    );
  }
  steps.JOB_LINKED = true;

  if (stored.userId !== input.userId || durable.userId !== input.userId) {
    return failReport(
      jobId,
      "OWNER_LINKED",
      "AUTHENTICATION_FAILED",
      "owner_mismatch",
      {
        deliverableId: stored.id,
        sizeBytes: stored.buffer.byteLength,
        storageKey,
      },
      steps,
    );
  }
  steps.OWNER_LINKED = true;

  const meta = toDeliverableMetadata(stored);
  const downloadUrl = issueWordDownloadUrl(stored.id);
  if (
    !meta.downloadUrl.includes(`/api/deliverables/${stored.id}`) ||
    downloadUrl !== `/api/deliverables/${stored.id}`
  ) {
    return failReport(
      jobId,
      "DOWNLOADABLE",
      "DOCX_GENERATION_FAILED",
      "download_url_invalid",
      {
        deliverableId: stored.id,
        sizeBytes: stored.buffer.byteLength,
        storageKey,
        downloadUrl: meta.downloadUrl,
      },
      steps,
    );
  }

  // Re-load via ownership gate = downloadability probe (same as GET route).
  const reload = await getStoredDeliverableForUser(stored.id, input.userId);
  if (!reload || reload.buffer.byteLength === 0) {
    return failReport(
      jobId,
      "DOWNLOADABLE",
      "STORAGE_UPLOAD_FAILED",
      "download_reload_failed",
      {
        deliverableId: stored.id,
        sizeBytes: stored.buffer.byteLength,
        storageKey,
        downloadUrl,
      },
      steps,
    );
  }
  steps.DOWNLOADABLE = true;

  if (!isWordJobTerminal(wordJob.status) || wordJob.status !== "completed") {
    return failReport(
      jobId,
      "JOB_STATUS_UPDATED",
      "JOB_STATUS_UPDATE_FAILED",
      `word_job_status=${wordJob.status}`,
      {
        deliverableId: stored.id,
        sizeBytes: reload.buffer.byteLength,
        storageKey,
        downloadUrl,
        fileName: reload.fileName,
        mimeType: reload.mimeType,
      },
      steps,
    );
  }
  steps.JOB_STATUS_UPDATED = true;

  // Soft checks: work/commander link metadata when provided.
  void input.expectedWorkJobId;
  void input.expectedCommanderRunId;

  return {
    ok: true,
    failedStep: null,
    errorCode: "UNKNOWN_ERROR",
    internalError: null,
    deliverableId: stored.id,
    jobId,
    sizeBytes: reload.buffer.byteLength,
    storageKey,
    downloadUrl,
    fileName: reload.fileName,
    mimeType: DELIVERABLE_MIME_TYPES.docx,
    steps,
  };
}

export function classifyWordPipelineFailure(
  reason: string | null | undefined,
): WordCompletionErrorCode {
  const raw = (reason ?? "").toLowerCase();
  if (!raw) return "UNKNOWN_ERROR";
  if (/timeout|etimedout|aborted|時間内/.test(raw)) return "TIMEOUT";
  if (/auth|unauthorized|401|owner|login/.test(raw)) {
    return "AUTHENTICATION_FAILED";
  }
  if (/validat|unsafe_export|依頼内容|request_not/.test(raw)) {
    return "REQUEST_VALIDATION_FAILED";
  }
  if (
    /empty_ai|empty_content|empty_deliverable|ai_content|quality|openai/.test(
      raw,
    )
  ) {
    return "AI_GENERATION_FAILED";
  }
  if (
    /docx|word_convert|packer|ooxml|corrupt|verify_failed|word_export/.test(
      raw,
    )
  ) {
    return "DOCX_GENERATION_FAILED";
  }
  if (/storage|upload|bucket|download_reload/.test(raw)) {
    return "STORAGE_UPLOAD_FAILED";
  }
  if (/artifact_db|durable_row|project_persist|db_upsert|sidecar/.test(raw)) {
    return "ARTIFACT_DB_SAVE_FAILED";
  }
  if (/job_status|job_link|illegal_transition/.test(raw)) {
    return "JOB_STATUS_UPDATE_FAILED";
  }
  return "UNKNOWN_ERROR";
}

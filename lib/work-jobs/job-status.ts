/**
 * Canonical work-job status — single source of truth for FE / API / durable store.
 *
 * Formal statuses:
 *   queued | processing | completed | failed | timed_out | cancelled
 *
 * Legacy wire/storage values are normalized on read and never written as-is
 * (except during one-shot migration of in-memory/disk payloads).
 */

/** Formal job lifecycle statuses (exactly these six). */
export const CANONICAL_JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
] as const;

export type CanonicalJobStatus = (typeof CANONICAL_JOB_STATUSES)[number];

/** Why processing is paused waiting on the user (not a separate status). */
export type JobBlockReason = "awaiting_confirmation" | null;

/** Internal error codes — never shown raw to end users. */
export const WORK_JOB_ERROR_CODES = [
  "REQUEST_VALIDATION_FAILED",
  "AUTHENTICATION_FAILED",
  "AI_GENERATION_FAILED",
  "DOCX_GENERATION_FAILED",
  "STORAGE_UPLOAD_FAILED",
  "ARTIFACT_DB_SAVE_FAILED",
  "JOB_STATUS_UPDATE_FAILED",
  "NOTIFICATION_CREATE_FAILED",
  "TIMEOUT",
  "UNKNOWN_ERROR",
] as const;

export type WorkJobErrorCode = (typeof WORK_JOB_ERROR_CODES)[number];

/** User-safe Japanese copy for each internal code. */
export const WORK_JOB_ERROR_USER_MESSAGES: Record<WorkJobErrorCode, string> = {
  REQUEST_VALIDATION_FAILED:
    "依頼内容を確認できませんでした。内容を見直して、もう一度お送りください。",
  AUTHENTICATION_FAILED:
    "確認が必要です。もう一度ログインしてください。",
  AI_GENERATION_FAILED:
    "AI応答の作成で問題がありました。入力内容は保存されています。もう一度お試しください。",
  DOCX_GENERATION_FAILED:
    "文書内容は作成できましたが、Wordファイルの作成に失敗しました。もう一度お試しください。",
  STORAGE_UPLOAD_FAILED:
    "ファイルの保存に失敗しました。もう一度お試しください。",
  ARTIFACT_DB_SAVE_FAILED:
    "成果物の登録に失敗しました。もう一度お試しください。",
  JOB_STATUS_UPDATE_FAILED:
    "処理状態の更新に失敗しました。履歴から状況をご確認ください。",
  NOTIFICATION_CREATE_FAILED:
    "処理は完了していますが、通知の作成に失敗しました。履歴からご確認ください。",
  TIMEOUT: "処理が時間内に終わりませんでした。もう一度お試しください。",
  UNKNOWN_ERROR: "処理を完了できませんでした。もう一度お試しください。",
};

/**
 * Allowed transitions. Terminal states have no outgoing edges.
 *
 * queued → processing | cancelled
 * processing → completed | failed | timed_out | cancelled
 * (awaiting_confirmation is blockReason on processing, not a status)
 */
export const JOB_STATUS_TRANSITIONS: Record<
  CanonicalJobStatus,
  readonly CanonicalJobStatus[]
> = {
  queued: ["processing", "cancelled"],
  processing: ["completed", "failed", "timed_out", "cancelled"],
  completed: [],
  failed: [],
  timed_out: [],
  cancelled: [],
};

export const TERMINAL_JOB_STATUSES: readonly CanonicalJobStatus[] = [
  "completed",
  "failed",
  "timed_out",
  "cancelled",
] as const;

/** Legacy / alias values seen in older records or mistaken FE checks. */
const LEGACY_STATUS_MAP: Record<string, CanonicalJobStatus> = {
  queued: "queued",
  processing: "processing",
  running: "processing",
  completed: "completed",
  complete: "completed",
  success: "completed",
  done: "completed",
  failed: "failed",
  error: "failed",
  timed_out: "timed_out",
  timeout: "timed_out",
  cancelled: "cancelled",
  canceled: "cancelled",
  // Confirmation wait was a status; now blockReason on processing.
  awaiting_confirmation: "processing",
  awaiting_resume: "processing",
};

export function isCanonicalJobStatus(value: unknown): value is CanonicalJobStatus {
  return (
    typeof value === "string" &&
    (CANONICAL_JOB_STATUSES as readonly string[]).includes(value)
  );
}

export function isTerminalJobStatus(status: CanonicalJobStatus): boolean {
  return (TERMINAL_JOB_STATUSES as readonly string[]).includes(status);
}

/**
 * Normalize any stored/wire status into a canonical value.
 * Unknown values → null (caller decides).
 */
export function normalizeJobStatus(value: unknown): CanonicalJobStatus | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const key = value.trim().toLowerCase();
  return LEGACY_STATUS_MAP[key] ?? null;
}

/**
 * Infer blockReason from legacy status strings.
 */
export function normalizeJobBlockReason(
  statusRaw: unknown,
  explicit?: JobBlockReason | undefined,
): JobBlockReason {
  if (explicit === "awaiting_confirmation") return "awaiting_confirmation";
  if (
    typeof statusRaw === "string" &&
    statusRaw.trim().toLowerCase() === "awaiting_confirmation"
  ) {
    return "awaiting_confirmation";
  }
  return null;
}

export function canTransitionJobStatus(
  from: CanonicalJobStatus,
  to: CanonicalJobStatus,
): boolean {
  if (from === to) return true; // idempotent no-op
  return JOB_STATUS_TRANSITIONS[from].includes(to);
}

export type JobTransitionRejection = {
  ok: false;
  code: "JOB_STATUS_UPDATE_FAILED";
  from: CanonicalJobStatus;
  to: CanonicalJobStatus;
  message: string;
};

export type JobTransitionAccepted = {
  ok: true;
  from: CanonicalJobStatus;
  to: CanonicalJobStatus;
  noop: boolean;
};

export function assertJobTransition(
  from: CanonicalJobStatus,
  to: CanonicalJobStatus,
): JobTransitionAccepted | JobTransitionRejection {
  if (from === to) {
    return { ok: true, from, to, noop: true };
  }
  if (!canTransitionJobStatus(from, to)) {
    return {
      ok: false,
      code: "JOB_STATUS_UPDATE_FAILED",
      from,
      to,
      message: `illegal_transition:${from}->${to}`,
    };
  }
  return { ok: true, from, to, noop: false };
}

/**
 * completed is allowed only when durable artifacts are confirmed.
 * Word-required jobs must also have a saved .docx reference.
 */
export function canMarkJobCompleted(input: {
  projectPersisted: boolean;
  wordRequired: boolean;
  wordDeliverablePresent: boolean;
}): { ok: true } | { ok: false; code: WorkJobErrorCode } {
  if (!input.projectPersisted) {
    return { ok: false, code: "ARTIFACT_DB_SAVE_FAILED" };
  }
  if (input.wordRequired && !input.wordDeliverablePresent) {
    return { ok: false, code: "DOCX_GENERATION_FAILED" };
  }
  return { ok: true };
}

export function userMessageForJobError(
  code: WorkJobErrorCode | null | undefined,
  fallback?: string | null,
): string {
  if (code && WORK_JOB_ERROR_USER_MESSAGES[code]) {
    return WORK_JOB_ERROR_USER_MESSAGES[code];
  }
  const trimmed = fallback?.trim();
  if (trimmed) return trimmed.slice(0, 240);
  return WORK_JOB_ERROR_USER_MESSAGES.UNKNOWN_ERROR;
}

export function classifyWorkJobError(
  reason: string | null | undefined,
): WorkJobErrorCode {
  const raw = (reason ?? "").toLowerCase();
  if (!raw) return "UNKNOWN_ERROR";
  if (/timeout|etimedout|aborted|時間内|timed_out/.test(raw)) return "TIMEOUT";
  if (/unauthorized|auth|401|ログイン/.test(raw)) return "AUTHENTICATION_FAILED";
  if (/validation|invalid|400|依頼内容/.test(raw)) {
    return "REQUEST_VALIDATION_FAILED";
  }
  if (/project_persist|artifact_db|成果物の登録|sidecar/.test(raw)) {
    return "ARTIFACT_DB_SAVE_FAILED";
  }
  if (/storage|upload|bucket|保存に失敗/.test(raw)) {
    return "STORAGE_UPLOAD_FAILED";
  }
  if (/docx|word生成|word_export|packer|ooxml/.test(raw)) {
    return "DOCX_GENERATION_FAILED";
  }
  if (/notification|notify|通知/.test(raw)) {
    return "NOTIFICATION_CREATE_FAILED";
  }
  if (/illegal_transition|status_update|job_status/.test(raw)) {
    return "JOB_STATUS_UPDATE_FAILED";
  }
  if (/openai|ai応答|empty_deliverable|vision|orchestr/.test(raw)) {
    return "AI_GENERATION_FAILED";
  }
  return "UNKNOWN_ERROR";
}

/** Stale processing window — just over route maxDuration (300s). */
export const JOB_STALE_PROCESSING_MS = 310_000;

export function isStaleProcessingJob(
  job: { status: CanonicalJobStatus; updatedAt: string },
  nowMs = Date.now(),
  staleMs = JOB_STALE_PROCESSING_MS,
): boolean {
  if (job.status !== "processing") return false;
  const updatedMs = new Date(job.updatedAt).getTime();
  if (Number.isNaN(updatedMs)) return true;
  return nowMs - updatedMs > staleMs;
}

export function timestampsForTransition(
  to: CanonicalJobStatus,
  nowIso: string,
  previous: {
    startedAt?: string | null;
    completedAt?: string | null;
    failedAt?: string | null;
  },
): {
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  updatedAt: string;
} {
  const startedAt =
    to === "processing"
      ? previous.startedAt ?? nowIso
      : previous.startedAt ?? null;

  if (to === "completed") {
    return {
      startedAt,
      completedAt: nowIso,
      failedAt: previous.failedAt ?? null,
      updatedAt: nowIso,
    };
  }
  if (to === "failed" || to === "timed_out") {
    return {
      startedAt,
      completedAt: previous.completedAt ?? null,
      failedAt: nowIso,
      updatedAt: nowIso,
    };
  }
  if (to === "cancelled") {
    return {
      startedAt,
      completedAt: previous.completedAt ?? null,
      failedAt: previous.failedAt ?? null,
      updatedAt: nowIso,
    };
  }
  return {
    startedAt,
    completedAt: previous.completedAt ?? null,
    failedAt: previous.failedAt ?? null,
    updatedAt: nowIso,
  };
}

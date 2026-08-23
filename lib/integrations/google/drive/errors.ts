import "server-only";

import { buildProductionDiagnosticId } from "@/lib/reliability/production-error-log";
import { safeLog } from "@/lib/security/redact";

export type DriveFailedStage =
  | "auth"
  | "scope"
  | "token_refresh"
  | "folder_cache_validate"
  | "folder_search_root"
  | "folder_create_root"
  | "folder_search_category"
  | "folder_create_category"
  | "folder_list"
  | "file_list"
  | "file_get"
  | "file_search"
  | "file_upload"
  | "file_download"
  | "file_move"
  | "file_copy"
  | "file_delete"
  | "provider";

export type DriveErrorStatus =
  | "needs_reconnect"
  | "insufficient_permission"
  | "not_found"
  | "rate_limited"
  | "provider_error"
  | "durable_unavailable";

const USER_MESSAGE: Record<DriveErrorStatus, string> = {
  needs_reconnect: "Google連携の有効期限が切れました。再接続してください",
  insufficient_permission:
    "Google Driveの権限が不足しています。再接続してDriveへのアクセスを許可してください",
  not_found: "指定したDrive上のファイルまたはフォルダが見つかりませんでした",
  rate_limited: "Google Driveの利用上限に達しました。しばらくしてからお試しください",
  provider_error:
    "Google Drive側で一時的な問題が起きています。しばらくしてからお試しください",
  durable_unavailable:
    "連携情報の確認に失敗しました。しばらくしてからもう一度お試しください",
};

export class GoogleDriveApiError extends Error {
  readonly name = "GoogleDriveApiError";
  readonly httpStatus: number;
  readonly failedStage: DriveFailedStage;
  readonly googleReason: string | null;
  readonly endpointKind: string;
  readonly diagnosticId: string;
  readonly resultStatus: DriveErrorStatus;
  readonly userMessage: string;

  constructor(input: {
    httpStatus: number;
    failedStage: DriveFailedStage;
    googleReason?: string | null;
    endpointKind: string;
    diagnosticId?: string;
    message?: string;
  }) {
    const resultStatus = classifyDriveHttpStatus(
      input.httpStatus,
      input.googleReason,
    );
    super(input.message || USER_MESSAGE[resultStatus]);
    this.httpStatus = input.httpStatus;
    this.failedStage = input.failedStage;
    this.googleReason = input.googleReason ?? null;
    this.endpointKind = input.endpointKind;
    this.diagnosticId =
      input.diagnosticId ?? buildProductionDiagnosticId("gdrive");
    this.resultStatus = resultStatus;
    this.userMessage = USER_MESSAGE[resultStatus];
  }
}

export function classifyDriveHttpStatus(
  httpStatus: number,
  reason?: string | null,
): DriveErrorStatus {
  const normalized = (reason ?? "").toLowerCase();
  if (httpStatus === 401) return "needs_reconnect";
  if (httpStatus === 429) return "rate_limited";
  if (httpStatus === 404) return "not_found";
  if (httpStatus === 403) {
    if (
      normalized.includes("ratelimit") ||
      normalized.includes("dailylimit") ||
      normalized.includes("usagelimit") ||
      normalized.includes("usageratelimit")
    ) {
      return "rate_limited";
    }
    return "insufficient_permission";
  }
  return "provider_error";
}

export function driveErrorHttpStatus(status: string): number {
  switch (status) {
    case "unauthorized":
    case "google_not_connected":
    case "needs_reconnect":
      return 401;
    case "feature_disabled":
    case "plan_required":
    case "insufficient_permission":
      return 403;
    case "not_found":
      return 404;
    case "unsupported_format":
      return 415;
    case "rate_limited":
      return 429;
    case "durable_unavailable":
      return 503;
    case "provider_error":
      return 502;
    default:
      return 400;
  }
}

type GoogleErrorBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
};

export function parseGoogleDriveErrorBody(payload: unknown): {
  message: string | null;
  reason: string | null;
} {
  const body = payload as GoogleErrorBody | null;
  const reason =
    body?.error?.errors?.[0]?.reason ??
    body?.error?.status ??
    null;
  const message = body?.error?.message ?? body?.error?.errors?.[0]?.message ?? null;
  return { message, reason };
}

export function logGoogleDriveDiagnostic(
  error: GoogleDriveApiError,
  extra?: Record<string, unknown>,
): void {
  safeLog("warn", "[Google Drive] provider failure", {
    diagnosticId: error.diagnosticId,
    failedStage: error.failedStage,
    httpStatus: error.httpStatus,
    googleReason: error.googleReason,
    endpointKind: error.endpointKind,
    resultStatus: error.resultStatus,
    ...extra,
  });
}

export function driveFailurePayload(error: GoogleDriveApiError): {
  status: DriveErrorStatus;
  message: string;
  diagnosticId: string;
  failedStage: DriveFailedStage;
} {
  return {
    status: error.resultStatus,
    message: error.userMessage,
    diagnosticId: error.diagnosticId,
    failedStage: error.failedStage,
  };
}

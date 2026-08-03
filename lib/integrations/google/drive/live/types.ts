/**
 * Google Drive Production Live Adapter — typed contracts.
 */

export const DRIVE_ADAPTER_MODE = "production" as const;
export const DRIVE_SERVICE_ID = "google_drive" as const;

export const DRIVE_CONFLICT_POLICIES = [
  "fail",
  "rename",
  "overwrite",
  "create_revision",
] as const;

export type DriveConflictPolicy = (typeof DRIVE_CONFLICT_POLICIES)[number];

/** Default: fail on same-name conflict — never silent overwrite. */
export const DEFAULT_DRIVE_CONFLICT_POLICY: DriveConflictPolicy = "fail";

export const DRIVE_CONNECTION_HEALTH = [
  "connected",
  "expired",
  "revoked",
  "missing_scope",
  "invalid",
  "reconnect_required",
  "disabled",
  "error",
  "disconnected",
] as const;

export type DriveConnectionHealth = (typeof DRIVE_CONNECTION_HEALTH)[number];

export type DriveUploadStepInput = {
  artifactId: string;
  fileName: string;
  mimeType: string;
  size: number;
  checksum: string;
  targetFolderId: string | null;
  folderPath: string | null;
  conflictPolicy: DriveConflictPolicy;
  createFolderIfMissing: boolean;
  idempotencyKey: string;
  ownerId: string;
  organizationId: string | null;
  runId: string;
  stepId: string;
  diagnosticId: string;
};

export type DriveFolderResolution = {
  folderId: string;
  folderName: string;
  folderUrl: string;
  created: boolean;
};

export type DriveExternalAction = {
  externalActionId: string;
  service: typeof DRIVE_SERVICE_ID;
  providerRequestId: string | null;
  fileId: string;
  webViewLink: string;
  targetFolderId: string;
  fileName: string;
  mimeType: string;
  size: number;
  checksum: string;
  status: "verified";
  startedAt: string;
  completedAt: string;
  retryCount: number;
  idempotencyKey: string;
  adapterMode: typeof DRIVE_ADAPTER_MODE;
  environment: string;
  diagnosticId: string;
  resultHash: string;
  duplicatePrevented: boolean;
};

export type DriveUploadAdapterResult =
  | {
      ok: true;
      action: DriveExternalAction;
      folder: DriveFolderResolution;
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      retryable: boolean;
      connectionHealth?: DriveConnectionHealth;
      needsUserInput?: boolean;
      retryCount: number;
    };

export type DriveRetryHistoryEntry = {
  attempt: number;
  at: string;
  errorCode: string;
  errorMessage: string;
  httpStatus?: number;
  retryAfterMs?: number;
};

export type DriveAdapterMetricsSnapshot = {
  uploadCount: number;
  uploadSuccessCount: number;
  uploadFailureCount: number;
  uploadSuccessRate: number;
  uploadFailureRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  retryRate: number;
  tokenRefreshCount: number;
  tokenRefreshRate: number;
  duplicatePreventedCount: number;
  scopeErrorCount: number;
  permissionErrorCount: number;
  verificationFailureCount: number;
  latenciesMs: number[];
};

/**
 * Dropbox Production Live Adapter — typed contracts.
 */

export const DROPBOX_ADAPTER_MODE = "production" as const;
export const DROPBOX_SERVICE_ID = "dropbox" as const;

export const DROPBOX_CONFLICT_POLICIES = [
  "fail",
  "rename",
  "overwrite",
  "autorename",
  "revision",
] as const;

export type DropboxConflictPolicy = (typeof DROPBOX_CONFLICT_POLICIES)[number];

/** Default: fail on same-name conflict — never silent overwrite. */
export const DEFAULT_DROPBOX_CONFLICT_POLICY: DropboxConflictPolicy = "fail";

export const DROPBOX_CONNECTION_HEALTH = [
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

export type DropboxConnectionHealth = (typeof DROPBOX_CONNECTION_HEALTH)[number];

export type DropboxUploadStepInput = {
  artifactId: string;
  fileName: string;
  mimeType: string;
  size: number;
  contentHash: string;
  targetPath: string;
  folderPath: string | null;
  conflictPolicy: DropboxConflictPolicy;
  createFolderIfMissing: boolean;
  createSharedLink: boolean;
  idempotencyKey: string;
  ownerId: string;
  organizationId: string | null;
  runId: string;
  stepId: string;
  diagnosticId: string;
};

export type DropboxFolderResolution = {
  targetPath: string;
  folderPath: string;
  folderName: string;
  created: boolean;
};

export type DropboxExternalAction = {
  externalActionId: string;
  service: typeof DROPBOX_SERVICE_ID;
  providerRequestId: string | null;
  fileId: string;
  pathDisplay: string;
  rev: string;
  size: number;
  contentHash: string;
  targetPath: string;
  fileName: string;
  mimeType: string;
  sharedLinkUrl: string | null;
  status: "verified";
  startedAt: string;
  completedAt: string;
  retryCount: number;
  idempotencyKey: string;
  adapterMode: typeof DROPBOX_ADAPTER_MODE;
  environment: string;
  diagnosticId: string;
  resultHash: string;
  duplicatePrevented: boolean;
};

export type DropboxUploadAdapterResult =
  | {
      ok: true;
      action: DropboxExternalAction;
      folder: DropboxFolderResolution;
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      retryable: boolean;
      connectionHealth?: DropboxConnectionHealth;
      needsUserInput?: boolean;
      retryCount: number;
    };

export type DropboxRetryHistoryEntry = {
  attempt: number;
  at: string;
  errorCode: string;
  errorMessage: string;
  httpStatus?: number;
  retryAfterMs?: number;
};

export type DropboxAdapterMetricsSnapshot = {
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

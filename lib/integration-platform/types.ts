/**
 * External Integration Production types.
 * "Connected API exists" is never enough — completion requires verified remote proof.
 */

export const INTEGRATION_SERVICE_IDS = [
  "google_drive",
  "dropbox",
  "x",
  "wordpress",
  "gmail",
  "outlook",
  "google_calendar",
  "slack",
  "discord",
  "notion",
  "line",
  "teams",
  "webhook",
  "supabase_storage",
  "cloudflare_r2",
  "s3",
] as const;

export type IntegrationServiceId = (typeof INTEGRATION_SERVICE_IDS)[number];

export const CONNECTION_STATUSES = [
  "CONNECTED",
  "EXPIRED",
  "REVOKED",
  "ERROR",
  "WAITING_APPROVAL",
  "RATE_LIMIT",
  "MISSING_SCOPE",
  "DISABLED",
  "DISCONNECTED",
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export type IntegrationImplementationClass =
  | "live"
  | "partial"
  | "mock"
  | "unwired"
  | "deprecated";

export type TokenRecord = {
  ownerId: string;
  serviceId: IntegrationServiceId;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  expiresAt: string | null;
  scopes: string[];
  lastUsedAt: string | null;
  failureCount: number;
  rotationVersion: number;
  updatedAt: string;
};

export type ConnectionRecord = {
  ownerId: string;
  serviceId: IntegrationServiceId;
  status: ConnectionStatus;
  statusMessage: string | null;
  scopes: string[];
  lastValidatedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  failureCount: number;
  implementationClass: IntegrationImplementationClass;
  metadata: Record<string, unknown>;
  updatedAt: string;
};

export type ExecuteInput = {
  ownerId: string;
  action: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  requireVerification?: boolean;
};

export type ExecuteResult = {
  ok: boolean;
  serviceId: IntegrationServiceId;
  action: string;
  externalId: string | null;
  externalUrl: string | null;
  verified: boolean;
  checksum?: string | null;
  attempts: number;
  retried: boolean;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  /** Never treat mock as production success when requireLiveProof */
  proofKind: "live" | "sandbox" | "mock" | "none";
};

export type UploadVerification = {
  uploaded: boolean;
  externalId: string | null;
  externalUrl: string | null;
  checksumSha256: string | null;
  downloadVerified: boolean;
  metadataMatched: boolean;
  byteLengthMatched: boolean;
};

export type PostVerification = {
  posted: boolean;
  externalId: string | null;
  externalUrl: string | null;
  publicStatus: string | null;
  fetchVerified: boolean;
};

export type RetryClassification =
  | "retryable_429"
  | "retryable_5xx"
  | "retryable_timeout"
  | "retryable_network"
  | "non_retryable_4xx"
  | "non_retryable_other";

export type IntegrationCallMetric = {
  serviceId: IntegrationServiceId;
  action: string;
  ok: boolean;
  durationMs: number;
  statusCode: number | null;
  retried: boolean;
  retryCount: number;
  classification: RetryClassification;
  at: string;
  sandbox: boolean;
};

export type IntegrationServiceMetrics = {
  serviceId: IntegrationServiceId;
  sampleSize: number;
  successRate: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  rateLimit429Rate: number;
  retryRate: number;
  failureRate: number;
  kind: "measured";
  sandbox: boolean;
};

export type CompletionGateInput = {
  artifactReady: boolean;
  requiredServices: IntegrationServiceId[];
  results: ExecuteResult[];
};

export type CompletionGateResult = {
  canComplete: boolean;
  reason: string | null;
  proofs: Array<{
    serviceId: IntegrationServiceId;
    externalId: string | null;
    externalUrl: string | null;
  }>;
};

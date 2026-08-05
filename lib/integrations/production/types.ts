/** Production-ready external integration contracts (extensible registry). */

export type ProductionIntegrationId =
  | "x"
  | "gmail"
  | "google_calendar"
  | "wordpress"
  | "dropbox";

export type IntegrationActionResult =
  | "success"
  | "duplicate"
  | "retry_exhausted"
  | "timeout"
  | "auth_failure"
  | "insufficient_permission"
  | "validation_failed"
  | "cancelled"
  | "error";

export type IntegrationAuditRecord = {
  request_id: string;
  diagnosticId: string;
  integration: ProductionIntegrationId | string;
  action: string;
  result: IntegrationActionResult;
  retry: number;
  durationMs: number;
  userId?: string;
  idempotencyKey?: string;
  message?: string;
  createdAt: string;
};

export type RetryClassification =
  | "retryable_429"
  | "retryable_5xx"
  | "retryable_timeout"
  | "retryable_network"
  | "non_retryable";

export type OAuthLifecyclePhase =
  | "authorize"
  | "callback"
  | "refresh"
  | "expired"
  | "insufficient_permission"
  | "disconnect"
  | "reconnect"
  | "cancel";

export type OAuthLifecycleEvent = {
  integration: ProductionIntegrationId | string;
  userId: string;
  phase: OAuthLifecyclePhase;
  request_id: string;
  diagnosticId: string;
  message: string;
  at: string;
};

export type ProductionConnectorDefinition = {
  id: ProductionIntegrationId | string;
  displayName: string;
  authType: "oauth2" | "application_password" | "api_key";
  supports: readonly string[];
};

export type RunIntegrationOptions = {
  integration: ProductionIntegrationId | string;
  action: string;
  userId?: string;
  idempotencyKey?: string;
  requestId?: string;
  maxAttempts?: number;
  /** When true, duplicate idempotency keys return prior success without re-executing. */
  preventDuplicate?: boolean;
};

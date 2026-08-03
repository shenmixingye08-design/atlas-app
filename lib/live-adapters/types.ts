/**
 * Production Live Adapter contract.
 * Sandbox / mock / stub success is forbidden in production mode.
 */

export type AdapterRuntimeMode = "production" | "preview" | "test";

export type IntegrationService =
  | "google_drive"
  | "gmail"
  | "google_calendar"
  | "dropbox"
  | "wordpress"
  | "x"
  | "supabase_storage"
  | "push"
  | "line"
  | "email_delivery"
  | "webhook";

export type AdapterClassification =
  | "production_live"
  | "sandbox"
  | "mock"
  | "stub"
  | "partial"
  | "deprecated"
  | "unregistered"
  | "broken"
  | "unsupported";

export type AdapterAvailability =
  | "available"
  | "beta"
  | "preparing"
  | "unsupported";

export type ValidationResult = {
  ok: boolean;
  code: string;
  message: string;
  details?: Record<string, string | number | boolean | null>;
};

export type LiveExecutionStatus =
  | "succeeded"
  | "failed"
  | "needs_configuration"
  | "needs_connection"
  | "needs_permission"
  | "needs_approval"
  | "duplicate_skipped"
  | "retrying";

export type AdapterCostUsage = {
  providerCalls: number;
  bytesUploaded?: number;
  estimatedCostUsd?: number;
};

export type LiveExecutionResult = {
  status: LiveExecutionStatus;
  externalActionId: string | null;
  externalUrl: string | null;
  startedAt: string;
  completedAt: string;
  retryable: boolean;
  errorCode: string | null;
  diagnosticId: string;
  providerRequestId: string | null;
  metadata: Record<string, string | number | boolean | null>;
  costUsage: AdapterCostUsage;
  summary: string;
};

export type LiveExecutionStatusQuery = {
  externalActionId: string;
  userId: string;
};

export type CompensationResult = {
  ok: boolean;
  message: string;
  errorCode?: string | null;
};

export type AdapterExecuteInput = {
  userId: string;
  runId: string;
  stepId: string;
  occurrenceKey?: string | null;
  configuration: Record<string, unknown>;
  approved: boolean;
  artifactBuffer?: Buffer | null;
  artifactFileName?: string | null;
  artifactMimeType?: string | null;
  contentHash?: string | null;
};

export interface LiveIntegrationAdapter {
  id: string;
  service: IntegrationService;
  mode: "production";
  availability: AdapterAvailability;
  classification: "production_live";
  requiresExternalActionId: boolean;
  validateConnection(userId: string): Promise<ValidationResult>;
  validatePermissions(userId: string): Promise<ValidationResult>;
  execute(input: AdapterExecuteInput): Promise<LiveExecutionResult>;
  getExecutionStatus?(
    input: LiveExecutionStatusQuery,
  ): Promise<LiveExecutionStatus>;
  retry?(input: AdapterExecuteInput): Promise<LiveExecutionResult>;
  compensate?(
    input: AdapterExecuteInput & { externalActionId: string },
  ): Promise<CompensationResult>;
}

/** Non-production adapters must declare mode explicitly (never silent). */
export interface NonProductionAdapter {
  id: string;
  service: IntegrationService;
  mode: "preview" | "test";
  classification: Exclude<AdapterClassification, "production_live">;
  availability: AdapterAvailability;
  execute(input: AdapterExecuteInput): Promise<LiveExecutionResult>;
  validateConnection(userId: string): Promise<ValidationResult>;
  validatePermissions(userId: string): Promise<ValidationResult>;
}

export type AnyIntegrationAdapter =
  | LiveIntegrationAdapter
  | NonProductionAdapter;

export type AdapterRegistry = {
  mode: AdapterRuntimeMode;
  adapters: ReadonlyMap<IntegrationService, AnyIntegrationAdapter>;
  get(service: IntegrationService): AnyIntegrationAdapter | null;
  require(service: IntegrationService): AnyIntegrationAdapter;
  list(): AnyIntegrationAdapter[];
};

export type ProductionConfigCheck = {
  ok: boolean;
  service: IntegrationService | "platform";
  key: string;
  status: "ok" | "needs_configuration" | "warn";
  adminMessage: string;
  userMessage: string;
};

export type PreflightIssue = {
  service: IntegrationService | "platform";
  code: string;
  message: string;
  blocking: boolean;
};

export type AutomationPreflightResult = {
  ok: boolean;
  canActivate: boolean;
  issues: PreflightIssue[];
  checkedServices: IntegrationService[];
  runtimeMode: AdapterRuntimeMode;
  checkedAt: string;
};

export type AdapterMetricSample = {
  service: IntegrationService;
  ok: boolean;
  latencyMs: number;
  retryable: boolean;
  errorCode: string | null;
  statusCodeHint: number | null;
  at: string;
};

export type AdapterHealthSnapshot = {
  service: IntegrationService;
  mode: AdapterRuntimeMode;
  registered: boolean;
  configured: boolean;
  classification: AdapterClassification;
  availability: AdapterAvailability;
  successRate: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  retryRate: number | null;
  rateLimit429Rate: number | null;
  authFailureCount: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  samples: number;
};

/**
 * Phase 3-1 External Live Adapter Audit — shared types.
 * Classification must never treat "connection UI exists" as Production Live.
 */

export const ADAPTER_CLASSIFICATIONS = [
  "Production Live",
  "Sandbox",
  "Mock",
  "Stub",
  "Partial",
  "OAuth Only",
  "UI Only",
  "Unregistered",
  "Broken",
  "Deprecated",
  "Unsupported",
] as const;

export type AdapterClassification = (typeof ADAPTER_CLASSIFICATIONS)[number];

export const ADAPTER_MODES = [
  "production",
  "preview",
  "sandbox",
  "mock",
  "stub",
  "test",
  "unwired",
  "unsupported",
] as const;

export type AdapterMode = (typeof ADAPTER_MODES)[number];

export const TOKEN_STORAGE_KINDS = [
  "db_plaintext",
  "db_encrypted",
  "clerk_metadata",
  "process_memory",
  "local_file",
  "env_secret",
  "mixed",
  "undefined",
  "none",
] as const;

export type TokenStorageKind = (typeof TOKEN_STORAGE_KINDS)[number];

export const FAIL_CLOSED_OUTCOMES = [
  "failed",
  "retry",
  "needs_configuration",
  "waiting_user",
  "success",
  "unknown",
] as const;

export type FailClosedOutcome = (typeof FAIL_CLOSED_OUTCOMES)[number];

export const RISK_SEVERITIES = ["P0", "P1", "P2"] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export type ExternalServiceAuditId =
  | "google_drive"
  | "gmail"
  | "google_calendar"
  | "dropbox"
  | "wordpress"
  | "x"
  | "slack"
  | "discord"
  | "notion"
  | "line"
  | "microsoft_outlook"
  | "microsoft_teams"
  | "webhook"
  | "push_notification"
  | "email_delivery"
  | "supabase_storage"
  | "s3_r2"
  | "youtube";

export type AutomationPathStatus =
  | "wired_live"
  | "registered_unwired"
  | "legacy_only"
  | "notification_only"
  | "storage_only"
  | "none";

export type ExternalServiceInventoryEntry = {
  serviceName: string;
  serviceId: ExternalServiceAuditId;
  classification: AdapterClassification;
  mode: AdapterMode;
  implementationFiles: string[];
  oauthFiles: string[];
  callbackRoutes: string[];
  tokenStore: TokenStorageKind;
  tokenStoreDetail: string;
  adapter: string | null;
  registry: string[];
  executor: string | null;
  automationStep: string | null;
  automationPath: AutomationPathStatus;
  uiConnectionScreens: string[];
  environmentVariables: string[];
  productionReachable: boolean;
  previewReachable: boolean;
  testOnly: boolean;
  deprecated: boolean;
  status: string;
  savesExternalActionId: boolean;
  savesExternalUrl: boolean;
  retrySupported: boolean;
  idempotency: "durable" | "in_process" | "weak" | "none" | "n/a";
  successCriteria: string[];
  notes: string[];
};

export type RegistryAuditEntry = {
  name: string;
  sourceFile: string;
  usedBy: string[];
  modeDetermination: string;
  services: string[];
  sandboxDefaultInProduction: boolean;
  mockFallback: boolean;
  stubFallback: boolean;
  unknownServiceHandling: string;
  missingAdapterHandling: string;
  productionSafe: boolean;
  risks: string[];
};

export type OAuthSecurityAuditEntry = {
  serviceId: ExternalServiceAuditId;
  hasOAuth: boolean;
  authorizationUrl: boolean;
  callback: boolean;
  stateValidation: boolean;
  pkce: boolean | "n/a";
  nonce: boolean | "n/a";
  redirectUriConfigured: boolean;
  scopesDocumented: boolean;
  accessToken: boolean;
  refreshToken: boolean;
  expiryTracked: boolean;
  tokenRefresh: boolean;
  revokedTokenHandling: boolean;
  reconnect: boolean;
  disconnect: boolean;
  ownerIsolation: boolean;
  tenantIsolation: boolean;
  tokenEncryption: boolean;
  tokenRedaction: boolean;
  auditLogging: boolean;
  gaps: Array<{ severity: RiskSeverity; finding: string }>;
};

export type TokenStorageAuditEntry = {
  serviceId: ExternalServiceAuditId;
  storage: TokenStorageKind;
  accessTokenEncrypted: boolean;
  refreshTokenEncrypted: boolean;
  secretRotation: boolean;
  ownerId: boolean;
  organizationId: boolean;
  scope: boolean;
  expiresAt: boolean;
  lastRefreshAt: boolean;
  revokedAt: boolean;
  connectionStatus: boolean;
  detail: string;
  severityIfUnsafe: RiskSeverity | null;
};

export type FailClosedCaseAudit = {
  caseId: string;
  v2AutomationOutcome: FailClosedOutcome;
  legacyOrUiOutcome: FailClosedOutcome;
  notes: string;
};

export type IntegrationRisk = {
  id: string;
  severity: RiskSeverity;
  serviceId: ExternalServiceAuditId | "cross_cutting";
  title: string;
  evidence: string[];
  impact: string;
  recommendedPhase: "3-2" | "later" | "ops";
};

export type Phase32Target = {
  rank: number;
  serviceId: ExternalServiceAuditId;
  adopt: boolean;
  reasons: string[];
};

export type ExternalAdapterAuditSnapshot = {
  auditedAt: string;
  phase: "3-1";
  inventory: ExternalServiceInventoryEntry[];
  registries: RegistryAuditEntry[];
  oauth: OAuthSecurityAuditEntry[];
  tokenStorage: TokenStorageAuditEntry[];
  risks: IntegrationRisk[];
  phase32Targets: Phase32Target[];
  verdicts: {
    productionLiveExternalExists: boolean;
    productionSandboxFallbackExists: boolean;
    v2ExternalAdaptersWired: boolean;
    plaintextTokensExist: boolean;
    ownerIsolationGapsExist: boolean;
  };
};

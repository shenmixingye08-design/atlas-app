/** ISO 8601 timestamp. */
export type Timestamp = string;

/** Opaque UUID primary key. */
export type EntityId = string;

/** Supported external service providers. */
export type IntegrationProviderId =
  | "google_drive"
  | "gmail"
  | "slack"
  | "discord"
  | "notion"
  | "wordpress"
  | "github"
  | "webhooks";

/** How an integration authenticates (OAuth wired later). */
export type IntegrationAuthType =
  | "oauth2"
  | "api_key"
  | "webhook_url"
  | "bot_token";

/** Connection lifecycle status. */
export type IntegrationStatus =
  | "disconnected"
  | "pending"
  | "connected"
  | "error";

/** Actions integrations can perform on completed work. */
export type IntegrationActionKind =
  | "upload_file"
  | "send_message"
  | "send_email"
  | "create_document"
  | "create_post"
  | "trigger_webhook";

/** Describes a capability exposed by a provider. */
export interface IntegrationAction {
  kind: IntegrationActionKind;
  label: string;
  description: string;
}

/** Static provider definition from the integration registry. */
export interface IntegrationProviderDefinition {
  id: IntegrationProviderId;
  displayName: string;
  description: string;
  /** Emoji or short icon token for UI. */
  icon: string;
  supportedActions: readonly IntegrationAction[];
  requiredScopes: readonly string[];
  authType: IntegrationAuthType;
}

/** A connected external service instance. */
export interface Integration {
  id: EntityId;
  provider: IntegrationProviderId;
  name: string;
  status: IntegrationStatus;
  connected: boolean;
  authType: IntegrationAuthType;
  scopes: readonly string[];
  lastSyncAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Provider-specific UI-safe metadata (no secrets). */
  metadata?: IntegrationMetadata;
}

/** Non-secret metadata surfaced in the integrations UI. */
export type IntegrationMetadata = {
  accountEmail?: string;
  accountName?: string;
  storageLocation?: string;
  lastUploadAt?: Timestamp | null;
  lastUploadStatus?: UploadBatchStatus | null;
  lastUploadError?: string | null;
  lastUploadDriveUrl?: string | null;
  uploadedFileCount?: number;
};

export type UploadBatchStatus = "success" | "partial" | "failed";

/** Provider registry entry merged with live connection state for the UI. */
export type IntegrationProviderView = IntegrationProviderDefinition & {
  connection: Integration | null;
  connectionStatus: IntegrationStatus;
};

export type IntegrationCatalog = {
  providers: IntegrationProviderView[];
  connections: Integration[];
};

export type ConnectIntegrationInput = {
  provider: IntegrationProviderId;
  name?: string;
};

export type IntegrationFilter = {
  provider?: IntegrationProviderId | IntegrationProviderId[];
  connected?: boolean;
  status?: IntegrationStatus | IntegrationStatus[];
  ids?: EntityId[];
};

/** Input for future deliverable dispatch after generation. */
export type DeliverableDispatchRequest = {
  deliverableId: string;
  integrationId: EntityId;
  action: IntegrationActionKind;
  metadata?: Readonly<Record<string, unknown>>;
};

export type DeliverableDispatchResult = {
  success: boolean;
  integrationId: EntityId;
  action: IntegrationActionKind;
  externalRef?: string;
  message: string;
};

/** Result of uploading one deliverable to an external provider. */
export type IntegrationUploadResult = {
  deliverableId: string;
  fileName: string;
  provider: IntegrationProviderId;
  integrationId: EntityId;
  workflowId: EntityId | null;
  success: boolean;
  driveFileId?: string;
  driveUrl?: string;
  uploadedAt?: Timestamp;
  error?: string;
};

/** Batch upload summary returned to the workspace after deliverable generation. */
export type IntegrationUploadSummary = {
  workflowId: EntityId | null;
  projectName: string;
  provider: IntegrationProviderId | null;
  storageLocation: string | null;
  folderUrl: string | null;
  uploads: IntegrationUploadResult[];
  status: UploadBatchStatus | null;
};

/** Persisted upload record for workflow history. */
export type IntegrationUploadRecord = {
  id: EntityId;
  integrationId: EntityId;
  provider: IntegrationProviderId;
  deliverableId: string;
  workflowId: EntityId | null;
  projectName: string;
  fileName: string;
  driveFileId: string | null;
  driveUrl: string | null;
  uploadedAt: Timestamp;
  status: "success" | "failed";
  error?: string;
};

export type UpdateIntegrationInput = Partial<
  Pick<
    Integration,
    | "name"
    | "status"
    | "connected"
    | "scopes"
    | "lastSyncAt"
    | "metadata"
  >
>;

export type OAuthCredentialRecord = {
  integrationId: EntityId;
  provider: IntegrationProviderId;
  accessToken: string;
  refreshToken: string;
  expiresAt: Timestamp;
  scope: string;
  updatedAt: Timestamp;
};

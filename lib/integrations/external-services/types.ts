/** ISO 8601 timestamp. */
export type Timestamp = string;

/** Managed external service identifiers. */
export type ExternalServiceId =
  | "google"
  | "dropbox"
  | "x"
  | "wordpress"
  | "youtube"
  | "notion";

/** Connection lifecycle — maps to UI: 未接続 / 接続準備中 / 接続済み / エラー */
export type ExternalServiceStatus =
  | "disconnected"
  | "pending"
  | "connected"
  | "error";

/** Public profile returned after OAuth — no tokens. */
export type ExternalServiceAccountProfile = {
  email: string;
  name: string | null;
  pictureUrl: string | null;
  /** Provider account id (e.g. X user id). */
  providerUserId?: string;
  /** X @handle without @ prefix. */
  username?: string;
};

/** Persisted connection record (no secrets — tokens stored server-side only). */
export type ExternalServiceConnection = {
  serviceId: ExternalServiceId;
  serviceName: string;
  status: ExternalServiceStatus;
  connectedAt: Timestamp | null;
  lastUsedAt: Timestamp | null;
  scopes: readonly string[];
  features: readonly string[];
  errorMessage: string | null;
  account?: ExternalServiceAccountProfile;
};

/** Static service definition from connector modules. */
export type ExternalServiceDefinition = {
  serviceId: ExternalServiceId;
  serviceName: string;
  icon: string;
  /** User-facing use cases (用途). */
  purposes: readonly string[];
  /** Planned OAuth scopes — wired when auth is added. */
  plannedScopes: readonly string[];
  /** Features ATLAS will use after connection. */
  plannedFeatures: readonly string[];
};

/** Registry entry merged with live connection for UI. */
export type ExternalServiceView = ExternalServiceDefinition & {
  connection: ExternalServiceConnection;
  /** When false, connect actions are disabled (feature flag). */
  featureEnabled: boolean;
};

export type ExternalServiceCatalog = {
  services: ExternalServiceView[];
};

/** Result from connector connect/disconnect. */
export type ExternalServiceConnectResult = {
  connection: ExternalServiceConnection;
  message: string;
  /** When set, client should redirect the user to start OAuth. */
  authorizeUrl?: string;
};

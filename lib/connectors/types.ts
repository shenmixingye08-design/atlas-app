/** Connector platform provider identifiers. */
export type ConnectorProviderId =
  | "google"
  | "microsoft"
  | "meta"
  | "openai"
  | "openrouter"
  | "anthropic"
  | "wordpress"
  | "notion"
  | "slack"
  | "discord"
  | "stripe"
  | "shopify"
  | "base"
  | "coconala"
  | "atlas";

export type ConnectorServiceId = string;

export type ConnectorServiceStatus = "connected" | "available" | "coming_soon";

export type ConnectorProviderStatus =
  | "connected"
  | "available"
  | "coming_soon";

type OAuthMetadataStub = {
  enabled: false;
  authorizationUrl: string | null;
  tokenUrl: string | null;
  scopes: readonly string[];
};

export type ConnectorServiceDefinition = {
  id: ConnectorServiceId;
  name: string;
  description: string;
  permissions: readonly string[];
  status: ConnectorServiceStatus;
};

export type ConnectorProviderDefinition = {
  id: ConnectorProviderId;
  name: string;
  icon: string;
  description: string;
  permissions: readonly string[];
  services: readonly ConnectorServiceDefinition[];
  defaultStatus: ConnectorProviderStatus;
  oauth: OAuthMetadataStub;
};

export type ConnectorProviderView = ConnectorProviderDefinition & {
  status: ConnectorProviderStatus;
  services: readonly ConnectorServiceDefinition[];
};

type ExtensionStub = { enabled: false; note: string };

export type ConnectorPlatformExtensions = {
  oauth: ExtensionStub;
  apiTokens: ExtensionStub;
  refreshTokens: ExtensionStub;
  permissions: ExtensionStub;
  serviceDiscovery: ExtensionStub;
};

export const CONNECTOR_EXTENSION_STUBS: ConnectorPlatformExtensions = {
  oauth: { enabled: false, note: "OAuth（将来対応）" },
  apiTokens: { enabled: false, note: "APIトークン（将来対応）" },
  refreshTokens: { enabled: false, note: "リフレッシュトークン（将来対応）" },
  permissions: { enabled: false, note: "権限管理（将来対応）" },
  serviceDiscovery: { enabled: false, note: "サービス検出（将来対応）" },
};

/** Resolved target for Action Engine execution planning. */
export type ResolvedConnectorTarget = {
  providerId: ConnectorProviderId | "atlas";
  serviceId: ConnectorServiceId;
  providerName: string;
  serviceName: string;
  permissions: readonly string[];
};

export type ActionConnectorRef =
  | "publish_blog"
  | "schedule_social_post"
  | "publish_linkedin"
  | "send_email"
  | "save_google_drive"
  | "executive_report"
  | "persist_learning"
  | "start_automation"
  | "schedule_blog_promotion"
  | "archive_research";

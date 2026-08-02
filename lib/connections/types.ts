import type { ConnectorProviderId } from "@/lib/connectors";

export type ProviderConnectionStatus =
  | "connected"
  | "not_connected"
  | "needs_reconnect"
  | "expired"
  | "insufficient_scope";

export type PermissionGrantState = "granted" | "missing";

export type OAuthReadiness = "ready" | "planned" | "unavailable";

export type PermissionGrant = {
  id: string;
  label: string;
  permission: string;
  state: PermissionGrantState;
};

export type ProviderConnectionView = {
  id: ConnectorProviderId;
  name: string;
  icon: string;
  description: string;
  connectionStatus: ProviderConnectionStatus;
  permissions: readonly PermissionGrant[];
  grantedCount: number;
  missingCount: number;
  services: readonly {
    id: string;
    name: string;
    status: "connected" | "available" | "coming_soon";
  }[];
  oauthReadiness: OAuthReadiness;
  lastUsedAt?: string | null;
  automationCount?: number;
};

export type ConnectionCenterSnapshot = {
  providers: readonly ProviderConnectionView[];
  /** Key: `${providerId}:${permission}` */
  grantedKeys: ReadonlySet<string>;
};

export type ActionPermissionStatus = "ready" | "permission_required";

export type ActionExecutionEvaluation = {
  permissionStatus: ActionPermissionStatus;
  readyForExecution: boolean;
  status: "waiting" | "ready" | "executing" | "completed" | "failed";
  missingPermissions: readonly string[];
};

type ExtensionStub = { enabled: false; note: string };

export type ConnectionCenterExtensions = {
  oauth: ExtensionStub;
  tokenRefresh: ExtensionStub;
  permissionValidation: ExtensionStub;
  providerHealth: ExtensionStub;
  apiLimits: ExtensionStub;
};

export const CONNECTION_EXTENSION_STUBS: ConnectionCenterExtensions = {
  oauth: { enabled: false, note: "OAuth（Live Integrations で管理）" },
  tokenRefresh: { enabled: false, note: "トークン更新（プロバイダー側で自動）" },
  permissionValidation: {
    enabled: false,
    note: "権限検証（Preflight / Connection Center）",
  },
  providerHealth: { enabled: false, note: "プロバイダー健全性（Live status）" },
  apiLimits: { enabled: false, note: "API制限（429 Retry）" },
};

export function permissionKey(
  providerId: ConnectorProviderId | "atlas",
  permission: string,
): string {
  return `${providerId}:${permission}`;
}

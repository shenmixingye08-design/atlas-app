import type {
  ExternalServiceConnectResult,
  ExternalServiceConnection,
  ExternalServiceStatus,
} from "./external-services/types";

/** Contract for per-service connector modules — OAuth/API added later. */
export type ExternalServiceConnectorModule = {
  connect(connection: ExternalServiceConnection): Promise<ExternalServiceConnectResult>;
  disconnect(connection: ExternalServiceConnection): Promise<ExternalServiceConnection>;
  /** Optional health check after real OAuth is wired. */
  validate?(): Promise<ExternalServiceStatus>;
};

/** Stub: simulates connect flow without external API calls. */
export async function stubConnectService(
  connection: ExternalServiceConnection,
): Promise<ExternalServiceConnectResult> {
  const now = new Date().toISOString();
  return {
    connection: {
      ...connection,
      status: "connected",
      connectedAt: now,
      lastUsedAt: null,
      scopes: [...connection.scopes],
      errorMessage: null,
    },
    message: "接続しました（プレースホルダー — 実際のOAuthは今後追加）",
  };
}

export async function stubDisconnectService(
  connection: ExternalServiceConnection,
): Promise<ExternalServiceConnection> {
  return {
    ...connection,
    status: "disconnected",
    connectedAt: null,
    lastUsedAt: connection.lastUsedAt,
    scopes: [],
    errorMessage: null,
  };
}

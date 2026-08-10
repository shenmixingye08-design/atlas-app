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

/**
 * @deprecated N-04: Stub connect that marks connected is forbidden in Production
 * paths. Use `unsupportedConnectService` for unoffered connectors.
 * Kept only for unit tests that assert the historical stub shape.
 */
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

/** N-04: Production-unoffered connector — never returns connected/success. */
export async function unsupportedConnectService(
  connection: ExternalServiceConnection,
): Promise<ExternalServiceConnectResult> {
  const message = `この連携（${connection.serviceId}）は現在Productionでご利用いただけません`;
  return {
    connection: {
      ...connection,
      status: "error",
      connectedAt: null,
      lastUsedAt: connection.lastUsedAt,
      scopes: [],
      errorMessage: message,
    },
    message,
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

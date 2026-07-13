import type {
  ExternalServiceConnectResult,
  ExternalServiceConnection,
} from "../external-services/types";
import type { ExternalServiceConnectorModule } from "../connector-types";

/**
 * WordPress uses Application Passwords (not OAuth).
 * Real connect/disconnect happen via connection-service + /api/wordpress/*.
 * This connector is only a fallback for the generic external-services path.
 */
export const wordpressConnector: ExternalServiceConnectorModule = {
  async connect(
    connection: ExternalServiceConnection,
  ): Promise<ExternalServiceConnectResult> {
    return {
      connection: {
        ...connection,
        status: connection.status === "connected" ? "connected" : "disconnected",
        errorMessage:
          connection.status === "connected"
            ? null
            : "WordPressは設定画面からサイトURLとアプリケーションパスワードを登録してください",
      },
      message:
        "WordPress連携は /settings/wordpress からサイトURLとアプリケーションパスワードを登録してください",
    };
  },

  async disconnect(
    connection: ExternalServiceConnection,
  ): Promise<ExternalServiceConnection> {
    return {
      ...connection,
      status: "disconnected",
      connectedAt: null,
      lastUsedAt: connection.lastUsedAt,
      scopes: [],
      errorMessage: null,
      account: undefined,
    };
  },
};

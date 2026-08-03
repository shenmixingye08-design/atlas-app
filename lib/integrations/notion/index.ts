import type { ExternalServiceDefinition } from "../external-services/types";
import {
  stubDisconnectService,
  type ExternalServiceConnectorModule,
} from "../connector-types";

export const notionServiceDefinition: ExternalServiceDefinition = {
  serviceId: "notion",
  serviceName: "Notion",
  icon: "📝",
  purposes: ["メモ", "タスク管理"],
  plannedScopes: ["read_content", "insert_content", "update_content"],
  plannedFeatures: ["成果物ページ作成", "タスク一覧への追加"],
};

/** Unsupported — stub connect success is forbidden. */
export const notionConnector: ExternalServiceConnectorModule = {
  async connect(connection) {
    return {
      connection: {
        ...connection,
        status: "error",
        errorMessage: "Notionは現在未対応です（準備中）",
      },
      message: "Notionは現在未対応です。利用可能になり次第ご案内します。",
    };
  },
  disconnect: stubDisconnectService,
};

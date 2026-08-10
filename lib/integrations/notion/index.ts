import type { ExternalServiceDefinition } from "../external-services/types";
import {
  stubDisconnectService,
  unsupportedConnectService,
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

/** N-04: Notion is a Production stub — connect is fail-closed. */
export const notionConnector: ExternalServiceConnectorModule = {
  connect: unsupportedConnectService,
  disconnect: stubDisconnectService,
};

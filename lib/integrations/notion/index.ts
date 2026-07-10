import type { ExternalServiceDefinition } from "../external-services/types";
import {
  stubConnectService,
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

export const notionConnector: ExternalServiceConnectorModule = {
  connect: stubConnectService,
  disconnect: stubDisconnectService,
};

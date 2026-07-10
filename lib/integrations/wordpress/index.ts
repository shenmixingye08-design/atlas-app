import type { ExternalServiceDefinition } from "../external-services/types";
import {
  stubConnectService,
  stubDisconnectService,
  type ExternalServiceConnectorModule,
} from "../connector-types";

export const wordpressServiceDefinition: ExternalServiceDefinition = {
  serviceId: "wordpress",
  serviceName: "WordPress",
  icon: "🌐",
  purposes: ["ブログ投稿"],
  plannedScopes: ["posts:create", "posts:edit"],
  plannedFeatures: ["下書き保存", "記事の公開", "カテゴリ設定"],
};

export const wordpressConnector: ExternalServiceConnectorModule = {
  connect: stubConnectService,
  disconnect: stubDisconnectService,
};

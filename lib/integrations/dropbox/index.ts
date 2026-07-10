import type { ExternalServiceDefinition } from "../external-services/types";
import {
  stubConnectService,
  stubDisconnectService,
  type ExternalServiceConnectorModule,
} from "../connector-types";

export const dropboxServiceDefinition: ExternalServiceDefinition = {
  serviceId: "dropbox",
  serviceName: "Dropbox",
  icon: "📦",
  purposes: ["ファイル保存", "資料整理"],
  plannedScopes: ["files.content.write", "files.content.read"],
  plannedFeatures: ["成果物アップロード", "フォルダ整理提案の実行"],
};

export const dropboxConnector: ExternalServiceConnectorModule = {
  connect: stubConnectService,
  disconnect: stubDisconnectService,
};

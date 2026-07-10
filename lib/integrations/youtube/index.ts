import type { ExternalServiceDefinition } from "../external-services/types";
import {
  stubConnectService,
  stubDisconnectService,
  type ExternalServiceConnectorModule,
} from "../connector-types";

export const youtubeServiceDefinition: ExternalServiceDefinition = {
  serviceId: "youtube",
  serviceName: "YouTube",
  icon: "▶️",
  purposes: ["動画投稿"],
  plannedScopes: [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
  ],
  plannedFeatures: ["動画メタデータ登録", "公開・限定公開の切り替え"],
};

export const youtubeConnector: ExternalServiceConnectorModule = {
  connect: stubConnectService,
  disconnect: stubDisconnectService,
};

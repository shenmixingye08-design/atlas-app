import type { ExternalServiceDefinition } from "../external-services/types";
import {
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

/** Unsupported — stub connect success is forbidden. */
export const youtubeConnector: ExternalServiceConnectorModule = {
  async connect(connection) {
    return {
      connection: {
        ...connection,
        status: "error",
        errorMessage: "YouTubeは現在未対応です（準備中）",
      },
      message: "YouTubeは現在未対応です。利用可能になり次第ご案内します。",
    };
  },
  disconnect: stubDisconnectService,
};

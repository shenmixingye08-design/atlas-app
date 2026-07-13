import type { ExternalServiceDefinition } from "../external-services/types";

import { X_OAUTH_SCOPES } from "./config";

export const xServiceDefinition: ExternalServiceDefinition = {
  serviceId: "x",
  serviceName: "X",
  icon: "✖️",
  purposes: ["SNS投稿", "自動投稿"],
  plannedScopes: [...X_OAUTH_SCOPES],
  plannedFeatures: [
    "投稿文案の公開",
    "予約投稿の実行",
    "下書き保存",
    "テスト投稿",
    "接続確認",
  ],
};

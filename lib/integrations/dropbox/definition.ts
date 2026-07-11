import type { ExternalServiceDefinition } from "../external-services/types";
import { DROPBOX_OAUTH_SCOPES } from "./config";

export const dropboxServiceDefinition: ExternalServiceDefinition = {
  serviceId: "dropbox",
  serviceName: "Dropbox",
  icon: "📦",
  purposes: ["ファイル保存", "資料整理", "共有リンク"],
  plannedScopes: [...DROPBOX_OAUTH_SCOPES],
  plannedFeatures: [
    "認証",
    "一覧",
    "検索",
    "アップロード",
    "削除",
    "共有",
    "AI要約",
    "PDF解析",
  ],
};

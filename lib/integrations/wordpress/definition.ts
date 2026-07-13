import type { ExternalServiceDefinition } from "../external-services/types";

export const wordpressServiceDefinition: ExternalServiceDefinition = {
  serviceId: "wordpress",
  serviceName: "WordPress",
  icon: "🌐",
  purposes: ["ブログ投稿", "下書き保存", "記事更新"],
  plannedScopes: ["posts:create", "posts:edit", "media:upload", "taxonomies:read"],
  plannedFeatures: [
    "下書き保存",
    "記事の公開",
    "記事の更新",
    "アイキャッチ設定",
    "カテゴリ・タグ取得",
  ],
};

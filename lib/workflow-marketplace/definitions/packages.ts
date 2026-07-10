import type { WorkflowPackageMetadata } from "../types";

/** Marketplace metadata — one entry per built-in CompanyTemplate. */
export const workflowPackageMetadata: readonly WorkflowPackageMetadata[] = [
  {
    templateId: "marketing-agency",
    slug: "marketing-agency",
    version: "1.2.0",
    author: "Atlas",
    publisher: "atlas",
    tagline: "キャンペーン調査とクライアント向け成果物の総合代理店ワークフロー",
    sections: ["featured", "popular", "marketing"],
    recommendedIntegrations: ["google_drive", "slack", "notion"],
    communityReady: true,
  },
  {
    templateId: "blogging",
    slug: "blogging-company",
    version: "1.1.0",
    author: "Atlas",
    publisher: "atlas",
    tagline: "SEO記事・編集カレンダー・コンテンツ調査のパイプライン",
    sections: ["new", "popular", "productivity"],
    recommendedIntegrations: ["google_drive", "wordpress", "gmail"],
    communityReady: true,
  },
  {
    templateId: "youtube",
    slug: "youtube-creator",
    version: "1.0.0",
    author: "Atlas",
    publisher: "atlas",
    tagline: "脚本・サムネイル指示・公開までのクリエイター向けワークフロー",
    sections: ["new", "popular", "productivity", "marketing"],
    recommendedIntegrations: ["google_drive", "discord", "slack"],
    communityReady: true,
  },
  {
    templateId: "affiliate",
    slug: "affiliate-marketing",
    version: "1.0.0",
    author: "Atlas",
    publisher: "atlas",
    tagline: "レビュー記事・比較ページ・アフィリエイトコンテンツの自動化",
    sections: ["popular", "productivity", "marketing"],
    recommendedIntegrations: ["google_drive", "wordpress", "webhooks"],
    communityReady: true,
  },
  {
    templateId: "sales",
    slug: "sales-company",
    version: "1.1.0",
    author: "Atlas",
    publisher: "atlas",
    tagline: "提案書・アウトリーチ・週次パイプラインレポート",
    sections: ["popular", "sales"],
    recommendedIntegrations: ["google_drive", "gmail", "slack"],
    communityReady: true,
  },
  {
    templateId: "real-estate",
    slug: "real-estate",
    version: "1.0.0",
    author: "Atlas",
    publisher: "atlas",
    tagline: "物件文案・市場レポート・クライアント向け提案資料",
    sections: ["sales"],
    recommendedIntegrations: ["google_drive", "gmail", "notion"],
    communityReady: true,
  },
  {
    templateId: "ecommerce",
    slug: "ecommerce",
    version: "1.2.0",
    author: "Atlas",
    publisher: "atlas",
    tagline: "商品説明・キャンペーン素材・ストアコンテンツを大量生成",
    sections: ["featured", "popular", "marketing", "sales"],
    recommendedIntegrations: ["google_drive", "slack", "webhooks"],
    communityReady: true,
  },
  {
    templateId: "saas",
    slug: "saas-company",
    version: "1.1.0",
    author: "Atlas",
    publisher: "atlas",
    tagline: "リリースノート・ドキュメント・オンボーディング・プロダクトマーケ",
    sections: ["new", "development"],
    recommendedIntegrations: ["google_drive", "github", "notion", "slack"],
    communityReady: true,
  },
] as const;

export type WorkflowPackageRegistry = Record<
  WorkflowPackageMetadata["templateId"],
  WorkflowPackageMetadata
>;

function buildRegistry(
  entries: readonly WorkflowPackageMetadata[],
): WorkflowPackageRegistry {
  return entries.reduce<Record<string, WorkflowPackageMetadata>>(
    (registry, entry) => {
      registry[entry.templateId] = entry;
      return registry;
    },
    {},
  ) as WorkflowPackageRegistry;
}

export const workflowPackageRegistry: WorkflowPackageRegistry =
  buildRegistry(workflowPackageMetadata);

export function getWorkflowPackageMetadata(
  templateId: WorkflowPackageMetadata["templateId"],
): WorkflowPackageMetadata {
  const metadata = workflowPackageRegistry[templateId];
  if (!metadata) {
    throw new Error(`Workflow package metadata not found: ${templateId}`);
  }
  return metadata;
}

export function listWorkflowPackageMetadata(): readonly WorkflowPackageMetadata[] {
  return workflowPackageMetadata;
}

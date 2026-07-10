import type { FeatureFlagDefinition, FeatureFlagId } from "./types";

export const FEATURE_FLAG_DEFINITIONS: readonly FeatureFlagDefinition[] = [
  {
    id: "google",
    label: "Google",
    description: "Gmail / Calendar / Drive 連携",
    category: "integration",
  },
  {
    id: "x",
    label: "X",
    description: "X（旧Twitter）連携",
    category: "integration",
  },
  {
    id: "wordpress",
    label: "WordPress",
    description: "WordPress 投稿連携",
    category: "integration",
  },
  {
    id: "dropbox",
    label: "Dropbox",
    description: "Dropbox ファイル連携",
    category: "integration",
  },
  {
    id: "video_generation",
    label: "動画生成",
    description: "動画ワークフロー・動画関連機能",
    category: "capability",
  },
  {
    id: "image_generation",
    label: "画像生成",
    description: "画像生成ステップ・画像関連機能",
    category: "capability",
  },
  {
    id: "sales_material",
    label: "営業資料",
    description: "営業資料ウィザード・資料生成",
    category: "capability",
  },
  {
    id: "blog",
    label: "ブログ",
    description: "ブログ作成・WordPress 投稿フロー",
    category: "capability",
  },
  {
    id: "sns",
    label: "SNS",
    description: "SNS投稿・共有フロー",
    category: "capability",
  },
  {
    id: "ai_employees",
    label: "AI秘書",
    description: "専属AI秘書による仕事依頼・オーケストレーション",
    category: "capability",
  },
  {
    id: "high_quality_mode",
    label: "高品質モード",
    description: "自動化の高品質実行モード",
    category: "capability",
  },
] as const;

export const FEATURE_FLAG_IDS: readonly FeatureFlagId[] =
  FEATURE_FLAG_DEFINITIONS.map((definition) => definition.id);

export function getFeatureFlagDefinition(
  id: FeatureFlagId,
): FeatureFlagDefinition {
  const definition = FEATURE_FLAG_DEFINITIONS.find((entry) => entry.id === id);
  if (!definition) {
    throw new Error(`Feature flag not found: ${id}`);
  }
  return definition;
}

export function isFeatureFlagId(value: string): value is FeatureFlagId {
  return FEATURE_FLAG_IDS.includes(value as FeatureFlagId);
}

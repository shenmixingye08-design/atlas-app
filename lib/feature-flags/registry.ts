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
  {
    id: "automation_v2_enabled",
    label: "自動化プラットフォーム v2",
    description: "新しい Automation Platform API / モデル（既存の定期の仕事は維持）",
    category: "capability",
  },
  {
    id: "automation_memory_enabled",
    label: "自動化メモリ連携",
    description: "Automation ごとの Memory Scope 利用（契約のみ → 段階公開）",
    category: "capability",
  },
  {
    id: "automation_approval_enabled",
    label: "自動化承認フロー",
    description: "実行前承認・ステップ承認（Execution Policy）",
    category: "capability",
  },
  {
    id: "automation_first_home_enabled",
    label: "Automation First ホーム",
    description: "ログイン後ホームを自動化・今日の仕事中心の構成へ切替",
    category: "capability",
  },
  {
    id: "automation_first_navigation_enabled",
    label: "Automation First ナビ",
    description: "サイドバー／下部ナビの優先順位を自動化ファーストへ",
    category: "capability",
  },
  {
    id: "automation_design_system_enabled",
    label: "Automation Design System",
    description: "状態色・タイポ・余白トークンの統一スタイルを適用",
    category: "capability",
  },
  {
    id: "automation_dashboard_v2_enabled",
    label: "自動化ダッシュボード v2",
    description: "自動化一覧・今日の仕事の運用向け表示",
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

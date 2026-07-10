/**
 * ATLAS new-feature evaluation schema.
 * Used as a single source of truth for docs and future tooling — not runtime enforcement.
 */

import { ATLAS_FEATURE_DECISION_RULE as PERSONALITY_DECISION_RULE } from "@/lib/atlas-personality";

export const ATLAS_PRODUCT_PHILOSOPHY =
  "ATLASはAIチャットサービスではなく、あなた専属のAI秘書です。仕事を覚え、習慣的な作業を減らし、お客様の時間を生み出すことを目的とします。" as const;

export const ATLAS_FEATURE_DECISION_RULE = PERSONALITY_DECISION_RULE;

export const ATLAS_CORE_VALUES = [
  "時間",
  "効率",
  "記憶",
  "継続",
  "分析",
] as const;

export const ATLAS_MISSION = [
  "仕事を記憶する",
  "習慣的な作業を覚える",
  "資料を整理する",
  "分析する",
  "改善案をご用意する",
] as const;

export const ATLAS_DEVELOPMENT_PRINCIPLES = [
  "AIを使わなくても実現できる処理にはAIを使わない",
  "AIは文章生成・判断・要約・提案など、本当に必要な場面だけで使用する",
  "定期実行・履歴管理・通知・曜日判定・ON/OFF判定・提案条件の判定は、可能な限り通常のプログラムで処理する",
  "画像生成・動画生成は目的ではなく、仕事完了のための手段として扱う",
  "人間の負担を減らすことを最優先する",
] as const;

export const ATLAS_FEATURE_EVALUATION_FIELDS = [
  "機能名",
  "ユーザー価値",
  "差別化",
  "習慣的な作業の削減",
  "AI必要度",
  "AIなしで実装可能",
  "運営コスト",
  "外部APIコスト",
  "コスト削減案",
  "優先度",
] as const;

export type AtlasFeatureEvaluationField =
  (typeof ATLAS_FEATURE_EVALUATION_FIELDS)[number];

export const ATLAS_COST_REDUCTION_CHECKLIST = [
  "エコモード",
  "まとめて生成",
  "キャッシュ再利用",
  "予約実行",
  "AI起動条件",
  "外部APIを使うタイミングの最小化",
  "完全自動ではなく承認後実行にできるか",
  "同じ処理を再生成しない設計",
] as const;

export type AtlasCostReductionItem =
  (typeof ATLAS_COST_REDUCTION_CHECKLIST)[number];

/** Markdown block for PRs, issues, and design notes. */
export function formatFeatureEvaluationTemplate(): string {
  const lines = [
    "【ATLAS機能評価】",
    "",
    `最重要判断: ${ATLAS_FEATURE_DECISION_RULE}`,
    "",
    ...ATLAS_FEATURE_EVALUATION_FIELDS.map((field) => `${field}：`),
    "",
    "コスト削減案（チェック）：",
    ...ATLAS_COST_REDUCTION_CHECKLIST.map((item) => `- [ ] ${item}`),
  ];
  return lines.join("\n");
}

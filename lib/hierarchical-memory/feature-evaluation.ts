/**
 * 【ATLAS機能評価】
 *
 * 機能名：階層型メモリ + 不足情報判定 + 成果物品質保証基盤
 * ユーザー価値：質問が減り、記憶が生成に反映され、成果物が自動評価・修正されてから納品される
 * 差別化：4階層優先順位・重大エラー否決・記憶の実プロンプト注入（表示だけではない）
 * 繰り返し作業の削減：はい
 * AI必要度：中 — 生成・修正は既存LLM。記憶判定・不足判定・品質ゲートは通常プログラム優先
 * AIなしで実装可能：一部 — 抽出・優先・重大エラー・不足判定はルール、本文生成はAI
 * 運営コスト：品質ループ最大+1〜2回（上限付き）。記憶は durable domain 再利用
 * 外部APIコスト：既存 OpenAI 経路のみ（新規ベンダーなし）
 * コスト削減案：軽量評価既定 / 重複評価省略 / 記憶件数・文字数上限 / 承認後学習 / 再提案禁止
 * 優先度：P0
 */
export const HIERARCHICAL_MEMORY_QUALITY_EVALUATION = {
  name: "hierarchical-memory-and-quality-assurance",
  priority: "P0",
  maxMemoriesInPrompt: 12,
  maxPromptChars: 2_400,
} as const;

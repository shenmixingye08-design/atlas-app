/**
 * 【ATLAS機能評価】
 *
 * 機能名：成果物好み学習（Deliverable Preference Learning）
 * ユーザー価値：修正するほど文体・構成・形式が自分好みになり、毎回の指示と手直しが減る
 * 差別化：会話履歴ではなく成果物の Diff・採用/削除・カテゴリ別 Memory を学習し、承認後のみ正式反映
 * 繰り返し作業の削減：はい（毎回の文体指定・構成修正・形式指定・PDF化などの習慣作業が減る）
 * AI必要度：低 — Diff抽出・Confidence・優先順位・候補化は通常プログラム。文言整形のみ任意
 * AIなしで実装可能：はい — ルールベース Diff・パターン・昇格閾値で足りる
 * 運営コスト：成果物生成1回あたり Memory 注入は要約のみ（上限件数・文字数）。候補はバッチ提案
 * 外部APIコスト：無（Memory本体）。成果物生成の既存AIコストのみ
 * コスト削減案：
 *   - [x] エコモード継承（注入量上限）
 *   - [x] まとめて候補提案
 *   - [x] 解決結果の再利用（同一 run 内 ledger）
 *   - [x] 予約不要
 *   - [x] AI起動条件を絞る（候補文言はルール、LLM不要）
 *   - [x] 外部APIなし
 *   - [x] 推測は候補→承認後のみ active
 *   - [x] 同じ fingerprint を再提案しない / 拒否済みは再提案禁止
 * 優先度：P0
 */

export const DELIVERABLE_PREFERENCE_LEARNING_EVALUATION = {
  name: "deliverable_preference_learning",
  priority: "P0",
  aiRequired: "low",
  phase: "personal_memory_extension",
} as const;

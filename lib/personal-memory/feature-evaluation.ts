/**
 * 【ATLAS機能評価】
 *
 * 機能名：Personal Memory（仕事の好みの安全な記憶）
 * ユーザー価値：前回の好み・修正を覚え、次回の指示量・修正量を減らす
 * 差別化：勝手に覚えず、候補承認・Scope分離・説明可能・Automation連携
 * 繰り返し作業の削減：はい（毎回の文体・形式・保存先・承認方針の指定が減る）
 * AI必要度：低〜中 — 候補文言の整形のみ任意。保存・優先順位・競合は通常プログラム
 * AIなしで実装可能：はい — ルールベースの候補抽出・解決・認可で足りる
 * 運営コスト：Memory全文を毎回LLMに送らない。Scope絞り込み・件数上限・要約
 * 外部APIコスト：無（Memory自体）。成果物生成時のみ既存AIコスト
 * コスト削減案：
 *   - エコモード継承
 *   - まとめて候補提案
 *   - 解決結果キャッシュ
 *   - 予約不要
 *   - AI起動は候補文言生成時のみ（既定OFF）
 *   - 外部APIなし
 *   - 推測は承認後のみactive
 *   - 同じ候補を再提案しない
 * 優先度：P0
 */

export const PERSONAL_MEMORY_FEATURE_EVALUATION = {
  name: "personal_memory_system",
  priority: "P0",
  aiRequired: "low",
  phase: "memory",
} as const;

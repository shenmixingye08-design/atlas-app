/**
 * 【ATLAS機能評価】
 *
 * 機能名：Automation / Work Memory 本番強化
 * ユーザー価値：過去に指定・修正・承認した好みを次回の自動化と投稿作成へ正確に反映し、毎回の指示と修正を減らす
 * 差別化：候補確認・スコープ優先・禁止事項最優先・serverless永続・危険事実の自動確定禁止
 * 繰り返し作業の削減：はい（文体・禁止・自動化設定・投稿好みの再入力が減る）
 * AI必要度：低〜中 — 差分測定・優先順位・競合解決は通常プログラム。文章生成時のみ既存AI
 * AIなしで実装可能：はい — 保存・確認・適用・計測はプログラム
 * 運営コスト：Memory全文を毎回LLMに送らない。件数・文字数上限。計測失敗は生成を止めない
 * 外部APIコスト：無（Memory自体）。成果物生成時のみ既存AIコスト
 * コスト削減案：
 *   - エコモード継承
 *   - まとめて候補提案
 *   - 解決結果キャッシュ
 *   - 予約実行不要（確認後に適用）
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

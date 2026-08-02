/**
 * 【ATLAS機能評価】
 *
 * 機能名：Memory品質計測（Memory Quality Metrics）
 * ユーザー価値：使えば使うほど修正が減ることを数値で見える化し、改善提案の根拠になる
 * 差別化：「Memoryがある」ではなく一致率・修正率・学習速度で品質向上を証明する
 * 繰り返し作業の削減：はい（低スコア時だけ改善提案→手直し習慣を減らす）
 * AI必要度：不要 — Diff/一致率/スコアは通常プログラム
 * AIなしで実装可能：はい
 * 運営コスト：評価はローカル計算のみ。LLM呼び出しなし
 * 外部APIコスト：無
 * コスト削減案：
 *   - [x] エコモード不要（計算のみ）
 *   - [x] まとめてダッシュボード集計
 *   - [x] 評価結果キャッシュ（直近N件保持）
 *   - [x] 予約不要
 *   - [x] AI起動なし
 *   - [x] 外部APIなし
 *   - [x] 改善提案は低スコア時のみ・承認後
 *   - [x] 同じ評価を再計算しない（記録ID）
 * 優先度：P0
 */

export const MEMORY_QUALITY_METRICS_EVALUATION = {
  name: "memory_quality_metrics",
  priority: "P0",
  aiRequired: "none",
  phase: "personal_memory_quality",
} as const;

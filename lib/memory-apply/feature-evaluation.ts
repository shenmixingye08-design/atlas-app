/**
 * 【ATLAS機能評価】
 *
 * 機能名：Memory本番適用（全経路配線）
 * ユーザー価値：会社情報・文体・テンプレ・OCR補正などを毎回入力せず、成果物の品質を記憶で改善できる
 * 差別化：チャット履歴ではなく永続コンテキストとして Automation / Vision / OCR / 成果物 / 通知まで適用
 * 繰り返し作業の削減：はい（署名・敬称・列順・ブランド・補正辞書の再指定が減る）
 * AI必要度：低 — 適用・差分計測・辞書補正は通常プログラム。文章生成時のみ既存AIを利用
 * AIなしで実装可能：はい — 解決結果の注入・テンプレ/ブランド重ね合わせ・補正辞書で足りる
 * 運営コスト：追加AI呼び出しなし。既存 Personal Memory の token 予算内で注入
 * 外部APIコスト：無（Memory自体）。成果物生成時のみ既存AIコスト
 * コスト削減案：
 *   - エコモード継承
 *   - まとめて候補提案
 *   - resolve結果の再利用（同一run内）
 *   - 予約実行はScheduler既存経路
 *   - AI起動条件は変更しない（Memory解決はプログラム）
 *   - 外部API最小化（Memory永続は既存 Durable）
 *   - 推測は候補→承認後のみ active
 *   - Regenerateは差分更新で再生成禁止（ゼロ生成禁止）
 * 優先度：P0
 */

export const MEMORY_APPLY_FEATURE_EVALUATION = {
  name: "memory_production_apply",
  priority: "P0",
  aiRequired: "low",
  phase: "memory_apply",
} as const;

/**
 * 【ATLAS機能評価】
 *
 * 機能名：Predictive Personal Memory（先回り適用）
 * ユーザー価値：指示なしで「いつもの好み」を先回り適用し、「このまま作成」だけで済む
 * 差別化：Prediction Score・適用理由・60%未満は確認・学習ループで精度向上
 * 繰り返し作業の削減：はい（毎回の好み入力・手直し・確認クリックが減る）
 * AI必要度：低 — 依頼解析・優先順位・Scoreは通常プログラム。LLM追加なし
 * AIなしで実装可能：はい（resolve優先度・証拠頻度・閾値・ON/OFF）
 * 運営コスト：計算のみ。LLM呼び出し増なし
 * 外部APIコスト：無
 * コスト削減案：
 *   - [x] エコモード不要（計算のみ）
 *   - [x] 予測結果をラン単位で再利用
 *   - [x] 直近予測履歴キャッシュ
 *   - [x] 予約不要
 *   - [x] AI起動なし（ルールベース予測）
 *   - [x] 外部APIなし
 *   - [x] 60%未満は勝手に適用せず確認
 *   - [x] 拒否済み・低予測は再提案しない
 * 優先度：P0
 */

export const PREDICTIVE_PERSONAL_MEMORY_EVALUATION = {
  name: "predictive_personal_memory",
  priority: "P0",
  aiRequired: "none",
  phase: "predictive_personal_memory",
  autoApplyThreshold: 0.6,
} as const;

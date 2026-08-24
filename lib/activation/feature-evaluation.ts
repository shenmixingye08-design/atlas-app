/**
 * 【ATLAS機能評価】
 *
 * 機能名：オンボーディングと Activation Funnel
 * ユーザー価値：登録直後に目的を選び、最初の実成果まで迷わず到達する
 * 差別化：画面操作ではなく実成果だけを Activation にする
 * 繰り返し作業の削減：はい（毎回の「何を頼めばよいか」をなくす）
 * AI必要度：不要 — 判定・進捗・Funnel は通常プログラム
 * AIなしで実装可能：はい
 * 運営コスト：追加 LLM なし。イベント書き込みは fail-open
 * 外部APIコスト：無（既存 Checkout / OAuth を再利用。価格変更なし）
 * コスト削減案：
 *   - エコモード：対象外（AI起動なし）
 *   - まとめて生成：しない（未マージの X batch は出さない）
 *   - キャッシュ：進捗・イベントは再利用
 *   - 予約実行：既存自動化へ誘導するだけ
 *   - AI起動条件：Quick Start は既存1回の無料枠へ
 *   - 外部API最小化：下書き確認まで X API を呼ばない
 *   - 承認後実行：自動投稿は承認制を選べる
 *   - 再生成禁止：同じ成功イベントは加算しない
 * 優先度：P0
 */
export const ACTIVATION_FEATURE_EVALUATION = {
  name: "onboarding-activation-funnel",
  aiRequired: false,
  stripePricesChanged: false,
  newPlans: false,
  productionTrialFixedDays: false,
} as const;

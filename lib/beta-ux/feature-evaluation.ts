/**
 * 【ATLAS機能評価】
 *
 * 機能名：実ユーザーβテスト・初回体験・離脱原因改善（Phase 6）
 *
 * ユーザー価値：説明なしで初回依頼→成果物完遂できることを実測し、離脱を潰す
 *
 * 差別化：開発者自己評価ではなく行動イベントと発言で改善する
 *
 * 繰り返し作業の削減：はい — 初回迷子・再説明コストを減らす
 *
 * AI必要度：不要（計測・分類・UIはプログラム）
 *
 * AIなしで実装可能：はい
 *
 * 運営コスト：低（イベントはメモリ/将来durable、AI追加なし）
 *
 * 外部APIコスト：無（β計測自体）。本番依頼時の既存OpenAIコストのみ
 *
 * コスト削減案：エコモード既存 / キャッシュ / 承認後実行 / 再生成禁止 / AI起動条件は依頼時のみ
 *
 * 優先度：P0
 */

export const BETA_UX_FEATURE_EVALUATION = {
  name: "beta-ux-phase6",
  priority: "P0",
  aiRequired: "none",
  reducesHabitualWork: true,
} as const;

/**
 * 【ATLAS機能評価】
 *
 * 機能名：Live Integrations（外部連携で仕事を完了）
 * ユーザー価値：AutomationがMINERVOT内で終わらず、Gmail/Calendar/Dropbox/WP/Xまで完了する
 * 差別化：Preflightで未接続を止め、失敗理由・再接続・Retryを見せる秘書体験
 * 繰り返し作業の削減：はい（手動アップロード・送信・投稿・予定登録を減らす）
 * AI必要度：不要 — 接続判定・OAuth・Retryは通常プログラム
 * AIなしで実装可能：はい
 * 運営コスト：既存OAuth/APIの延長。新規LLMなし
 * 外部APIコスト：有（各サービス従量）— 実行時のみ・承認後・Preflight通過後
 * コスト削減案：
 *   - [x] エコ不要（連携自体）
 *   - [x] まとめて接続状態キャッシュ
 *   - [x] Token更新キャッシュ
 *   - [x] 予約実行はAutomation
 *   - [x] AI起動なし
 *   - [x] Preflightで無駄な外部API呼び出し防止
 *   - [x] 高リスクは承認後
 *   - [x] Duplicate防止で再送禁止
 * 優先度：P0
 */

export const LIVE_INTEGRATIONS_FEATURE_EVALUATION = {
  name: "live_integrations",
  priority: "P0",
  aiRequired: "none",
  phase: "live_integrations",
  services: ["gmail", "google_calendar", "dropbox", "wordpress", "x"] as const,
} as const;

/**
 * 【ATLAS機能評価】
 *
 * 機能名：External Integrations Production（Live Adapter）
 * ユーザー価値：外部サービスへの保存・投稿・送信が最後まで完了し、途中成功に騙されない
 * 差別化：Connection→Permission→Execution→Verification→Evidence→Notification の Fail Closed
 * 繰り返し作業の削減：はい（再投稿・再確認・手動リトライが減る）
 * AI必要度：不要（連携実行は通常プログラム）
 * AIなしで実装可能：はい
 * 運営コスト：中（OAuth運用・Provider API・Owner監視）
 * 外部APIコスト：有（Gmail/Drive/Dropbox/X/WP/Calendar — 実行時のみ）
 * コスト削減案：
 *   - エコモード：対象外
 *   - まとめて生成：既存エコ継承
 *   - キャッシュ再利用：idempotencyで再投稿禁止
 *   - 予約実行：Scheduler経由
 *   - AI起動条件：連携Step到達時のみ
 *   - 外部API最小化：preflightで未接続は起動拒否
 *   - 承認後実行：高リスクは承認必須
 *   - 同じ処理を再生成しない：idempotency + evidence
 * 優先度：P0
 */

export const INTEGRATIONS_PRODUCTION_FEATURE_EVALUATION = {
  name: "external_integrations_production_live_adapters",
  priority: "P0",
  aiRequired: false,
  liveCredentialSoak: false,
} as const;

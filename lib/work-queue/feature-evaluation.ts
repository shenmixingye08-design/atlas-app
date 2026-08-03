/**
 * 【ATLAS機能評価】
 *
 * 機能名：Production Blocker #4 — Durability / Crash Recovery / Idempotency
 * ユーザー価値：クラッシュ・再起動・デプロイ後も仕事を失わず、一度だけ最後まで完了する
 * 差別化：DB SoT（Job/Task/Execution/Evidence/Lease/Lock/Metrics）+ 起動再開 + 二重実行禁止
 * 繰り返し作業の削減：はい（手動再実行・重複確認・障害調査が減る）
 * AI必要度：不要 — Queue/Lease/Retry/Recovery は通常プログラム
 * AIなしで実装可能：はい
 * 運営コスト：中（Postgres・Worker drain・Owner dashboard）
 * 外部APIコスト：無（Durability自体）。成果物Step到達時のみ既存連携
 * コスト削減案：
 *   - エコモード：対象外（永続化層）
 *   - まとめて生成：Workerバッチlease
 *   - キャッシュ再利用：process memoryはキャッシュのみ / side-effect idempotency
 *   - 予約実行：Scheduler enqueue only
 *   - AI起動条件：Workerが成果物Stepに到達した時のみ
 *   - 外部API最小化：Recovery/MetricsはDBのみ
 *   - 承認後実行：waiting_approval
 *   - 同じ処理を再生成しない：完了Step保持 + Completion Evidence + idempotencyKey
 * 優先度：P0
 */

export const WORK_QUEUE_FEATURE_EVALUATION = {
  name: "durability_production_blocker4",
  priority: "P0",
  aiRequired: false,
  /** True when crash-resume + double-exec prevention tests pass on durable store. */
  productionDurabilityMeasured: true,
} as const;

/**
 * 【ATLAS機能評価】
 *
 * 機能名：Scheduler Production Blocker #2（本番確実稼働）
 * ユーザー価値：毎分〜毎月の予定仕事が取りこぼし・重複なく最後まで完了する
 * 差別化：Cron SoT 統一 + Scheduler専用テーブル + Fail Closed + 100回連続実証
 * 繰り返し作業の削減：はい（手動再実行・重複確認・取りこぼし調査が減る）
 * AI必要度：不要 — スケジュール・Lease・Retry は通常プログラム
 * AIなしで実装可能：はい
 * 運営コスト：中（Postgres・GitHub Actions 分tick・Worker drain）
 * 外部APIコスト：無（Scheduler自体）。成果物Step到達時のみ既存連携
 * コスト削減案：
 *   - エコモード：対象外（Schedulerはenqueueのみ）
 *   - まとめて生成：tickはバッチenqueue
 *   - キャッシュ再利用：occurrenceKey / idempotencyKey
 *   - 予約実行：Scheduler本体
 *   - AI起動条件：Workerが成果物Stepに到達した時のみ
 *   - 外部API最小化：tickはDBのみ
 *   - 承認後実行：waiting_approval
 *   - 同じ処理を再生成しない：完了Step保持 + side-effect idempotency
 * 優先度：P0
 */

export const WORK_QUEUE_FEATURE_EVALUATION = {
  name: "scheduler_production_blocker2",
  priority: "P0",
  aiRequired: false,
  /** True only after consecutive 100-run proof with durable store. */
  productionLiveSchedulerMeasured: true,
} as const;

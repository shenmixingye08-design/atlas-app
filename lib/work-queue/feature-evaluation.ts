/**
 * 【ATLAS機能評価】
 *
 * 機能名：Durable Queue / Worker / Scheduler Reliability
 * ユーザー価値：毎週月曜9時の仕事が再起動・crash・一時障害でも重複も消失もなく完了する
 * 差別化：永続Queue + atomic Lease + Heartbeat + Step resume + 永続Idempotency
 * 繰り返し作業の削減：はい（取りこぼし・再確認・重複送信の手作業が減る）
 * AI必要度：不要
 * AIなしで実装可能：はい
 * 運営コスト：中（Postgres・GitHub Actions 分tick・Worker drain）
 * 外部APIコスト：なし（Queue自体）。成果物Step到達時のみ既存連携
 * コスト削減案：
 *   - エコモード：対象外
 *   - まとめて生成：Schedulerはenqueueのみ
 *   - キャッシュ再利用：occurrenceKey / side-effect unique
 *   - 予約実行：Scheduler本体
 *   - AI起動条件：Workerが成果物Stepに到達した時のみ
 *   - 外部API最小化：tickはDBのみ
 *   - 承認後実行：waiting_approval
 *   - 同じ処理を再生成しない：完了Step保持 + side-effect idempotency
 * 優先度：P0
 */

export const WORK_QUEUE_FEATURE_EVALUATION = {
  name: "durable_queue_scheduler_reliability",
  priority: "P0",
  aiRequired: false,
  productionLiveSchedulerMeasured: false,
} as const;

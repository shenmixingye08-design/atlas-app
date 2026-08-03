/**
 * 【ATLAS機能評価】
 *
 * 機能名：Scheduler・Queue・Worker Production Ready
 * ユーザー価値：設定した時刻に仕事が失われず・重複せず・途中成功なしで最後まで終わる
 * 差別化：チャットではなく「約束した時刻に仕事が終わる」信頼性
 * 繰り返し作業の削減：はい
 * AI必要度：不要（スケジューリング・キューは通常プログラム）
 * AIなしで実装可能：はい
 * 運営コスト：中（Postgres行・Cron/Actions分）
 * 外部APIコスト：なし（Queue自体）
 * コスト削減案：
 *   - エコモード：対象外
 *   - まとめて生成：Schedulerはenqueueのみ
 *   - キャッシュ再利用：occurrenceKeyで再enqueue禁止
 *   - 予約実行：Scheduler本体
 *   - AI起動条件：Workerが成果物Stepに到達した時のみ
 *   - 外部API最小化：tickはDBのみ
 *   - 承認後実行：waiting_approval
 *   - 同じ処理を再生成しない：成功Step保持
 * 優先度：P0
 */

export const WORK_QUEUE_FEATURE_EVALUATION = {
  name: "scheduler_queue_worker_production",
  priority: "P0",
  aiRequired: false,
} as const;

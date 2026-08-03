/**
 * 【ATLAS機能評価】
 *
 * 機能名：Scheduler Production Cutover（Phase 2-5）
 * ユーザー価値：予定実行の異常を運営が検知・復旧でき、手動監視の習慣が減る
 * 差別化：Health/Metrics/Alert/Dashboard/Runbook/Chaos を正式 Scheduler 経路に接続
 * 繰り返し作業の削減：はい — 障害時の手探り確認・再tick確認を Runbook と Alert に寄せる
 * AI必要度：不要
 * AIなしで実装可能：はい — 通常プログラムの観測・閾値・運用手順
 * 運営コスト：低（metrics 集計・Alert 評価・Owner UI）
 * 外部APIコスト：無（通知先接続時のみ Owner 通知）
 * コスト削減案：
 *   - エコモード：N/A
 *   - まとめて生成：N/A
 *   - キャッシュ：metrics snapshot
 *   - 予約実行：Scheduler 本体
 *   - AI起動条件：なし
 *   - 外部API最小化：Alert は閾値超過時のみ通知
 *   - 承認後実行：N/A
 *   - 再生成禁止：N/A
 * 優先度：P0
 */

export const SCHEDULER_CUTOVER_FEATURE_EVALUATION = {
  name: "scheduler_production_cutover",
  phase: "2-5",
  priority: "P0",
  aiRequired: false,
  claims24hProductionOnlyWithEvidence: true,
} as const;

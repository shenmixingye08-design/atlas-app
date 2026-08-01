/**
 * 【ATLAS機能評価】
 *
 * 機能名：Automation Execution System（Run / Approval / Retry / History）
 * ユーザー価値：自動化を作ったあと、確認・実行・失敗復旧・履歴まで安心して任せられる
 * 差別化：保存だけでなく、準備→承認→実行→Retry→通知→履歴の一貫した実行系
 * 繰り返し作業の削減：はい（毎週の実行・確認・失敗対応を自動化）
 * AI必要度：中 — 実行準備の整理・成果物生成に必要。状態遷移・Retry・認可は通常プログラム
 * AIなしで実装可能：一部 — スケジューラ・承認・Retry・履歴は通常プログラム
 * 運営コスト：実行時のみLLM。Approval/Retry/通知は追加APIコストなし
 * 外部APIコスト：有（X/Gmail等は承認後のみ）
 * コスト削減案：
 *   - エコモード継承
 *   - まとめて生成（既存SNSバッチ）
 *   - キャッシュ再利用（オーケストレーション）
 *   - 予約実行
 *   - AI起動条件（preparing完了かつ承認後のみ）
 *   - 外部API最小化（高リスクはApproval後）
 *   - 承認後実行
 *   - 同じ occurrence を再生成しない（idempotency）
 * 優先度：P0
 */

export const AUTOMATION_EXECUTION_FEATURE_EVALUATION = {
  name: "automation_execution_system",
  priority: "P0",
  aiRequired: "medium",
  phase: 3,
} as const;

/**
 * 【ATLAS機能評価】
 *
 * 機能名：Automation Execution Engine（最後まで完了する実行基盤）
 * ユーザー価値：Automationを保存して終わりではなく、放置しても仕事が完了する
 * 差別化：途中失敗から再開・承認/入力停止・Retry・Timelineで「今どこ」が見える
 * 繰り返し作業の削減：はい（手動のやり直し・進捗確認・失敗追いを減らす）
 * AI必要度：不要 — 状態遷移・Retry・Timeout・監査は通常プログラム
 * AIなしで実装可能：はい
 * 運営コスト：既存 V2 Run の延長。新規 LLM なし
 * 外部APIコスト：無（実行時の既存連携コストのみ）
 * コスト削減案：
 *   - [x] エコ不要（実行エンジン自体）
 *   - [x] 成功 Step 保持で再実行コスト削減
 *   - [x] Artifact 重複禁止
 *   - [x] 予約実行は既存 Scheduler
 *   - [x] AI起動なし
 *   - [x] 外部APIは Step 成功時のみ
 *   - [x] 高リスクは承認後のみ
 *   - [x] Retry で二重実行しない
 * 優先度：P0
 */

export const AUTOMATION_EXECUTION_ENGINE_FEATURE_EVALUATION = {
  name: "automation_execution_engine",
  priority: "P0",
  aiRequired: "none",
  phase: "execution_engine",
} as const;

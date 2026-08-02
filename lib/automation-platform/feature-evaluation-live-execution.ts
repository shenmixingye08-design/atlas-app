/**
 * 【ATLAS機能評価】
 *
 * 機能名：Automation V2 Live Execution Integration
 * ユーザー価値：自動化が画面上の定義だけでなく、本物の成果物生成・外部連携・通知まで完了し、習慣作業を実際に代行する
 * 差別化：チャットで毎回依頼するのではなく、既存MINERVOTエンジンへ接続した自動化が最後まで仕事を終わらせる
 * 繰り返し作業の削減：はい
 * AI必要度：中 — 文書生成・VisionはAIが必要。Schedule・Queue・Idempotency・OAuth・保存は通常プログラム
 * AIなしで実装可能：一部 — 外部投稿・保存・通知・QueueはAIなし。成果物本文生成と画像解析はAI依存
 * 運営コスト：実行時のみ既存エンジン/外部APIを起動。未接続はfail-closedで無駄呼びなし
 * 外部APIコスト：有（OpenAI Vision、X/Gmail/Calendar/WordPress/Dropbox、Storage。接続済みユーザーの実行時のみ）
 * コスト削減案：
 *   - エコモード継承
 *   - まとめて生成（既存バッチ）
 *   - キャッシュ再利用（idempotency / artifact key）
 *   - 予約実行
 *   - AI起動条件（preflight通過・承認後のみ）
 *   - 外部API最小化（未接続は呼び出さない）
 *   - 承認後実行（高リスクStep）
 *   - 同じ occurrence / step attempt を再生成しない
 * 優先度：P0
 *
 * 備考：モック成功禁止。Adapter未接続・認証不足はneeds_configuration/FAIL。既存deliverables/integrationsを重複実装しない。
 */

export const AUTOMATION_LIVE_EXECUTION_FEATURE_EVALUATION = {
  name: "automation_v2_live_execution",
  priority: "P0",
  aiRequired: "medium",
  phase: 8,
} as const;

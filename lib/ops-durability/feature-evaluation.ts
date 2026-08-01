/**
 * 【ATLAS機能評価】
 *
 * 機能名：ジョブ・通知・Storage・外部連携 耐久試験 Phase 3
 *
 * ユーザー価値：依頼〜完了〜保存〜通知〜外部実行が止まらず・重複せず・追跡可能であることを証明する
 *
 * 差別化：n=1やモック成功ではなく、状態遷移・idempotency・retry/timeout・同時実行の実測
 *
 * 繰り返し作業の削減：はい — 手動のジョブ監視・再送確認・重複投稿チェックを削減
 *
 * AI必要度：不要（計測・状態機械・Storage・通知。Vision系は既存経路、鍵がなければ未接続扱い）
 *
 * AIなしで実装可能：はい
 *
 * 運営コスト：低〜中（ローカル計測中心、本番E2Eは secrets 必須）
 *
 * 外部APIコスト：本番E2E時のみ（X/Gmail/Calendar/WP/Dropbox）— 未接続は成功率に含めない
 *
 * コスト削減案：
 * - エコモード：AI起動なしでジョブ/通知/Storage計測
 * - まとめて生成：バッチ計測
 * - キャッシュ再利用：idempotency で完了結果再利用（再生成禁止）
 * - 予約実行：cron tick 経由の retry のみ
 * - AI起動条件：Visionケースのみ、鍵がなければスキップして分母除外
 * - 外部API最小化：接続済みのみ実呼び出し
 * - 承認後実行：外部投稿はテストアカウント/下書き優先
 * - 同じ処理を再生成しない：idempotencyKey
 *
 * 優先度：P0
 */

export const OPS_DURABILITY_FEATURE_EVALUATION = {
  name: "ops-durability-phase3",
  priority: "P0",
  aiRequired: "none",
  reducesHabitualWork: true,
} as const;

/**
 * 【ATLAS機能評価】
 *
 * 機能名：Scheduler Core Unification（2-2）
 * ユーザー価値：約束した時刻の仕事が漏れず二重にならず、手動再tick・再確認の習慣が減る
 * 差別化：入口・認証・nextRunAt・due tick・occurrence・HistoryをDurable上の1本に統一
 * 繰り返し作業の削減：はい
 * AI必要度：不要 — 時刻計算・due処理は通常プログラム
 * AIなしで実装可能：はい — DB + Cron + 決定論的時刻計算
 * 運営コスト：低（tick内の通常処理・History行・Outbox行）
 * 外部APIコスト：無
 * コスト削減案：
 *   - エコモード：N/A（Scheduler自体はAIなし）
 *   - まとめて生成：due batch enqueue
 *   - キャッシュ再利用：occurrence unique で再enqueue禁止
 *   - 予約実行：本機能本体
 *   - AI起動条件：worker stepのみ（本Phase対象外）
 *   - 外部API最小化：tick内で成果物生成しない
 *   - 承認後実行：既存 waiting_approval を維持
 *   - 再生成禁止：occurrence/idempotency unique
 * 優先度：P0
 */

export const SCHEDULER_CORE_FEATURE_EVALUATION = {
  name: "scheduler_core_unification",
  priority: "P0",
  aiRequired: false,
  formalPath: "/api/internal/scheduler/tick",
  secretPrimary: "SCHEDULER_CRON_SECRET",
  secretCompat: "CRON_SECRET",
  secretCompatUntil: "2026-10-01",
} as const;

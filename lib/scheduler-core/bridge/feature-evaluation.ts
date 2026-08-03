/**
 * 【ATLAS機能評価】
 *
 * 機能名：Scheduler → Durable Queue → Worker Bridge（Phase 2-3）
 * ユーザー価値：約束した仕事が「Job作成だけ」で止まらず、確実にQueueへ入りWorkerが取得開始できる
 * 差別化：Outbox + Dispatcher で DB commit 後の Queue 投入を保証し、失敗時は completed/nextRun 更新を禁止
 * 繰り返し作業の削減：はい — 手動再enqueue・再tick・取りこぼし確認の習慣が減る
 * AI必要度：不要 — Queue bridge / Outbox / lease は通常プログラム
 * AIなしで実装可能：はい — Durable Outbox + Work Queue + Worker lease
 * 運営コスト：低（Outbox行・Dispatcher・既存 Queue metrics）
 * 外部APIコスト：無
 * コスト削減案：
 *   - エコモード：N/A（AIなし）
 *   - まとめて生成：batch outbox dispatch
 *   - キャッシュ再利用：occurrence unique で duplicate enqueue 禁止
 *   - 予約実行：Scheduler本体
 *   - AI起動条件：Worker step のみ（本Phase非対象）
 *   - 外部API最小化：bridge内で成果物生成しない
 *   - 承認後実行：既存 waiting_approval 維持
 *   - 再生成禁止：outbox unique(occurrence, pending) + queue occurrence unique
 * 優先度：P0
 */

export const SCHEDULER_BRIDGE_FEATURE_EVALUATION = {
  name: "scheduler_queue_worker_bridge",
  phase: "2-3",
  priority: "P0",
  aiRequired: false,
  outboxPattern: true,
  fireAndForgetEnqueue: false,
  workerBypassForbidden: true,
} as const;

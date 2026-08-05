/**
 * 【ATLAS機能評価】P0-6 Durable Automation Engine
 *
 * 機能名：Automation（定期の仕事）の Durable DB 単一SoT化
 * ユーザー価値：Vercel再起動/Cold Startでも消えず、二重実行・実行漏れ・再試行不能を防ぐ
 * 差別化：定義・schedule・retry・pause/resume・execution history を DB 中心に統一
 * 繰り返し作業の削減：はい（再作成・再予約・重複確認・失敗の手作業リカバリを削減）
 * AI必要度：不要（本P0は永続化・claim・retry・履歴。AI実行は既存パイプライン）
 * AIなしで実装可能：はい
 * 運営コスト：低（Postgres + 既存 work-queue / automation jobs）
 * 外部APIコスト：なし（新規外部APIなし）
 * コスト削減案：
 *   - エコモード: N/A（永続化レイヤ）
 *   - まとめて生成: scheduler batch enqueue
 *   - キャッシュ再利用: process cache は二次、SoTはDB
 *   - 予約実行: next_run_at / scheduled_at
 *   - AI起動条件: 変更なし（既存 execution level）
 *   - 外部API最小化: N/A
 *   - 承認後実行: 既存 approval フロー維持
 *   - 再生成禁止: occurrenceKey / idempotency + durable nextRun
 * 優先度：P0
 */
export const P0_6_FEATURE_EVALUATION = {
  name: "P0-6 Durable Automation Engine",
  priority: "P0" as const,
};

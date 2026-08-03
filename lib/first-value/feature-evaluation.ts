/**
 * 【ATLAS機能評価】
 *
 * 機能名：Production Blocker #5 — First Value Experience（初回15分価値体験）
 * ユーザー価値：登録後15分以内に成果物完成・保存・通知・ダウンロードまで体験できる
 * 差別化：「Wizard完了」ではなく「仕事完了」まで保証。980円の価値を初回で実感
 * 繰り返し作業の削減：はい（初回セットアップ迷い・空ホーム・再設定が減る）
 * AI必要度：中 — 本文はテンプレ+入力で保証。高度な文案は成果物Step到達時のみ
 * AIなしで実装可能：一部 — 導線・即Run・ROI表示・Analyticsは通常プログラム
 * 運営コスト：低〜中（初回1回の成果物生成。Scheduler待ちなし）
 * 外部APIコスト：有（成果物生成時のみ。エコ/オフライン本文で最小化可）
 * コスト削減案：
 *   - エコモード：初回はテンプレ本文で成果物保証（LLM必須にしない）
 *   - まとめて生成：対象外（初回1件）
 *   - キャッシュ再利用：同一idempotencyで二重生成禁止
 *   - 予約実行：頻度は保存するが初回は即Run
 *   - AI起動条件：本文不足時のみ高度生成（本PRはテンプレ保証）
 *   - 外部API最小化：即Run 1回 / 通知は成果物・Automation・Memoryのみ
 *   - 承認後実行：初回は自動完了（習慣削減優先）
 *   - 同じ処理を再生成しない：firstValueJobId + idempotencyKey
 * 優先度：P0
 */

export const FIRST_VALUE_FEATURE_EVALUATION = {
  name: "first_value_production_blocker5",
  priority: "P0",
  aiRequired: "partial",
  targetMinutes: 15,
  idealMinutes: 10,
} as const;

/**
 * 【ATLAS機能評価】
 *
 * 機能名：証拠付き品質保証ダッシュボード（Evidence Quality Assurance）
 *
 * ユーザー価値：運営が成功率・失敗率・p95・E2E証拠で公開可否を客観判断できる
 *
 * 差別化：自己採点ではなく実測・ログ・ゲートに基づく Release Ready
 *
 * 繰り返し作業の削減：はい — 手動ログ突合・感覚採点を削減
 *
 * AI必要度：不要
 *
 * AIなしで実装可能：はい
 *
 * 運営コスト：低（既存イベント集約＋ローカルE2E）
 *
 * 外部APIコスト：無（本番E2Eは明示opt-in）
 *
 * コスト削減案：読取のみ集約、E2Eは承認後実行、キャッシュ30s、再生成禁止、AI起動なし
 *
 * 優先度：P0
 */

export const QUALITY_ASSURANCE_FEATURE_EVALUATION = {
  name: "証拠付き品質保証ダッシュボード",
  priority: "P0",
  aiRequired: "none",
  reducesHabitualWork: true,
} as const;

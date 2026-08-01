/**
 * 【ATLAS機能評価】
 *
 * 機能名：Release Blocker Audit（公開阻止監査）Phase 4
 *
 * ユーザー価値：公開後の漏洩・課金事故・消失・権限事故を公開前に阻止する
 *
 * 差別化：Criticalを格下げせず、実コード経路で権限/課金/復旧を証明
 *
 * 繰り返し作業の削減：はい — 手動セキュリティ確認の反復を削減
 *
 * AI必要度：不要
 *
 * AIなしで実装可能：はい
 *
 * 運営コスト：低（ローカル監査中心）
 *
 * 外部APIコスト：無（本番E2Eは別ゲート）
 *
 * コスト削減案：AI不使用 / 承認後の本番再試験 / 同じ脆弱性を再生成しない検証固定
 *
 * 優先度：P0
 */

export const RELEASE_BLOCKER_FEATURE_EVALUATION = {
  name: "release-blocker-phase4",
  priority: "P0",
  aiRequired: "none",
  reducesHabitualWork: true,
} as const;

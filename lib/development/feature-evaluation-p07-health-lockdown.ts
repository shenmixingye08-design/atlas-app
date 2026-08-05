/**
 * 【ATLAS機能評価】
 *
 * 機能名：P07 公開ヘルスプローブの認証ロックダウン
 * ユーザー価値：未認証の OpenAI 課金・スキーマ適用・診断情報露出を止め、公開前の重大リスクを除去
 * 差別化：運用プローブは CRON/Owner のみ。一般ユーザー体験は変更なし
 * 繰り返し作業の削減：はい（インシデント調査・コスト事故対応の削減）
 * AI必要度：不要
 * AIなしで実装可能：はい
 * 運営コスト：低
 * 外部APIコスト：削減（匿名 force=1 による Vision 課金を遮断）
 * コスト削減案：
 *   - エコモード: N/A
 *   - まとめて生成: N/A
 *   - キャッシュ: 既存 in-process cache 維持（認可後のみ）
 *   - 予約実行: Cron Bearer のみ
 *   - AI起動条件: 認可済みプローブのみ Vision 実行
 *   - 外部API最小化: 匿名呼び出し禁止
 *   - 承認後実行: Owner/Cron のみ
 *   - 再生成禁止: N/A
 * 優先度：P0（公開 Blocker）
 */
export const P07_HEALTH_LOCKDOWN_FEATURE_EVALUATION = {
  name: "P07 Health Probe Auth Lockdown",
  priority: "P0" as const,
};

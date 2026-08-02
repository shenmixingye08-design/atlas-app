/**
 * 【ATLAS機能評価】
 *
 * 機能名：Workflow Learning（改善候補→承認→新revision）
 * ユーザー価値：手直し・失敗・確認・待ち時間・コストを、根拠付き提案と承認のもとで継続削減
 * 差別化：無断書き換えではなく、根拠・差分・Trial・Rollback付きの安全な改善
 * 繰り返し作業の削減：はい
 * AI必要度：低（パターン検出はルール。文章要約のみ必要時に限定し本Phaseはルール生成）
 * AIなしで実装可能：はい（ルールベース検出）
 * 運営コスト：追加AIコストほぼなし。分析はオンデマンド／週次
 * 外部APIコスト：無（既存Runデータを再利用）
 * コスト削減案：エコ無関係 / まとめて通知 / キャッシュ済みRun再利用 /
 *   予約分析可 / AI起動なし / 外部APIなし / 承認後のみ適用 / 再生成禁止
 * 優先度：P0
 */

export const WORKFLOW_LEARNING_FEATURE_EVALUATION = {
  name: "workflow_learning",
  priority: "P0",
  aiRequired: false,
} as const;

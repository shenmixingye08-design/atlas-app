/**
 * 【ATLAS機能評価】
 *
 * 機能名：PDF生成 Production Ready 品質強化
 *
 * ユーザー価値：企業が提出・印刷・保管まで安心して使える PDF を得られる
 *
 * 差別化：生成できるだけでなく仕様検査・日本語埋め込み・表/画像・耐久試験まで担保
 *
 * 繰り返し作業の削減：はい — 修復・レイアウト手直し・文字化け対応の習慣作業を減らす
 *
 * AI必要度：不要（レイアウト・検査は通常プログラム）
 *
 * AIなしで実装可能：はい
 *
 * 運営コスト：低（検査はローカル、AI追加なし）
 *
 * 外部APIコスト：無
 *
 * コスト削減案：
 * - エコモード：対象外（非AI）
 * - まとめて生成：耐久試験でバッチ検証
 * - キャッシュ再利用：同一内容の再生成禁止は既存 revision 設計
 * - 予約実行：対象外
 * - AI起動条件：AI不使用
 * - 外部API最小化：追加APIなし
 * - 承認後実行：品質検査で自動不合格を弾く
 * - 再生成禁止：revision は新ID、元ファイル不変
 *
 * 優先度：P0
 */

export const PDF_PRODUCTION_FEATURE_EVALUATION = {
  name: "pdf-production-ready",
  priority: "P0",
  aiRequired: "none",
  reducesHabitualWork: true,
} as const;

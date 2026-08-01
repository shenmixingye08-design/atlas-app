/**
 * 【ATLAS機能評価】
 *
 * 機能名：Vision Production Ready（画像→仕事完了）
 *
 * ユーザー価値：画像を送るだけで書類判定・OCR・情報抽出・成果物まで完了する
 *
 * 差別化：OCR転記で終わらず、業務フロー別の成果物生成まで担保
 *
 * 繰り返し作業の削減：はい — 手入力・転記・帳票作成の習慣作業を減らす
 *
 * AI必要度：高（画像理解・OCR・分類はAI必須。判定後の整形・検査は通常プログラム）
 *
 * AIなしで実装可能：一部（画質補正・必須項目検査・フォーマット決定は非AI）
 *
 * 運営コスト：中（Vision APIは必要時のみ。エコモード・キャッシュ・再解析禁止で抑制）
 *
 * 外部APIコスト：有（OpenAI Vision、従量）
 *
 * コスト削減案：
 * - エコモード：detail=low / compact profile
 * - まとめて生成：バッチ解析
 * - キャッシュ再利用：contentHash キャッシュ
 * - 予約実行：対象外
 * - AI起動条件：画像添付時のみ
 * - 外部API最小化：前処理で縮小・再送は compact
 * - 承認後実行：連絡先保存などは承認後
 * - 再生成禁止：forceRefresh 以外はキャッシュ
 *
 * 優先度：P0
 */

export const VISION_PRODUCTION_FEATURE_EVALUATION = {
  name: "vision-production-ready",
  priority: "P0",
  aiRequired: "high",
  reducesHabitualWork: true,
} as const;

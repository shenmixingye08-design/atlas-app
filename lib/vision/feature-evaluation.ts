/**
 * 【ATLAS機能評価】
 *
 * 機能名：企業品質 Vision 画像解析（ChatGPT級AI秘書）
 *
 * ユーザー価値：写真・書類・画面を送るだけで、補正→理解→最適成果物まで秘書が完遂する
 *
 * 差別化：OCR転記ではなく構造理解。Structured Outputs・段階進捗・タイムアウト耐性を備える
 *
 * 繰り返し作業の削減：はい — 手入力転記、形式選び、傾き直し、再送オペを削減
 *
 * AI必要度：高 — 文書理解・表構造・レイアウト把握に Vision が必要。前処理・形式選択ルールはプログラム
 *
 * AIなしで実装可能：一部 — 回転/ノイズ/コントラスト/リサイズは sharp。理解と成果物選定はAI
 *
 * 運営コスト：画像1枚あたり Vision 1回（タイムアウト時のみ最大4試行）。エコモードで detail/再試行抑制
 *
 * 外部APIコスト：有（OpenAI Vision）— 解析時のみ。キャッシュで同一画像の再解析を抑制
 *
 * コスト削減案：
 * - エコモード：compactプロファイル優先、AIレポート省略
 * - まとめて生成：バッチ内複数画像を1回の成果物生成へ
 * - キャッシュ再利用：contentHash + promptVersion
 * - 予約実行：定期スキャン取り込みはジョブ経路
 * - AI起動条件：attachmentIds がある時のみ
 * - 外部API最小化：Files API・リサイズでトークン/帯域削減
 * - 承認後実行：needs_input 時はユーザー確認後に再解析
 * - 再生成禁止：idempotencyKey / forceRefresh 明示時のみ再実行
 *
 * 優先度：P0
 */

export const VISION_QUALITY_FEATURE_EVALUATION = {
  name: "企業品質Vision画像解析",
  priority: "P0",
  aiRequired: "high",
  reducesHabitualWork: true,
} as const;

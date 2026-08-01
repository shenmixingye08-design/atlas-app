/**
 * 【ATLAS機能評価】
 *
 * 機能名：Vision/OCR Phase1 本番実測ハーネス
 *
 * ユーザー価値：画像解析が本番で使えるかを n≥100 の実測で証明し、失敗原因を潰す
 *
 * 差別化：モック成功率ではなく OpenAI Vision 実到達・期待値比較・失敗分類
 *
 * 繰り返し作業の削減：はい — 手動目視・感覚判定を削減
 *
 * AI必要度：測定対象として Vision API を使用（測定ロジック自体は AI 不要）
 *
 * AIなしで実装可能：測定基盤ははい / 実測には OpenAI 必須
 *
 * 運営コスト：中（100件×Vision、承認後・明示フラグでのみ実行）
 *
 * 外部APIコスト：有（QUALITY_LIVE_VISION=1 かつ OPENAI_API_KEY 時のみ）
 *
 * コスト削減案：承認後実行、エコ/compact、キャッシュ禁止（測定時 force）、再生成禁止、
 * 故障注入はローカルフラグのみ、画像本体をログ禁止
 *
 * 優先度：P0
 */

export const VISION_EVAL_FEATURE_EVALUATION = {
  name: "Vision/OCR Phase1 本番実測ハーネス",
  priority: "P0",
  aiRequired: "measurement_target_only",
  reducesHabitualWork: true,
} as const;

/**
 * 【ATLAS機能評価】
 *
 * 機能名：PowerPoint業務代行エンジン（PPTX Secretary）
 *
 * ユーザー価値：短い依頼やWord/Excel/PDF/画像から、構成・文章・デザイン・図解・
 * グラフ・発表原稿まで揃った実務用プレゼンを秘書が代行する
 *
 * 差別化：「.pptxを出すAI」ではなく、用途別ストーリー・ブランド・ノート・再編集まで完結
 *
 * 繰り返し作業の削減：はい — 章立て、整形、グラフ化、発表原稿、提出用PDF化を削減
 *
 * AI必要度：中 — 構成・要約のみAI可。レイアウト・グラフ・テーマ適用は通常プログラム
 *
 * AIなしで実装可能：一部 — テンプレ構成・pptx描画・検証・変換はプログラム完結
 *
 * 運営コスト：長文要約時のみLLM。テンプレ適用・描画は追加AIなし
 *
 * 外部APIコスト：有（OpenAI）— 任意。エコモードではルールベース構成のみ
 *
 * コスト削減案：
 * - エコモード：アウトラインは用途テンプレ、ノート短縮
 * - まとめて生成：pptx+pdfを1ジョブ
 * - キャッシュ：同一 idempotencyKey で重複禁止
 * - 予約実行：定期報告は既存ジョブ
 * - AI起動条件：構造化済みJSONはAIスキップ
 * - 外部API最小化：描画は pptxgenjs ローカル
 * - 承認後実行：根拠のない数値は needs_input
 * - 再生成禁止：revision（元上書き禁止）
 *
 * 優先度：P0
 */

export const PPTX_SECRETARY_FEATURE_EVALUATION = {
  name: "PowerPoint業務代行エンジン",
  priority: "P0",
  aiRequired: "medium",
  reducesHabitualWork: true,
  productionGate: true,
} as const;

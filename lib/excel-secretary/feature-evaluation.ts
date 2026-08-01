/**
 * 【ATLAS機能評価】
 *
 * 機能名：Excel業務代行エンジン（Excel Secretary）
 *
 * ユーザー価値：自然言語・画像・PDF・Word・CSVから実務品質のExcelを生成・編集・分析し、
 * Excel作業そのものを秘書が代行する
 *
 * 差別化：「.xlsxを出すAI」ではなく、数式・表・書式・分析・再編集まで含む業務代行
 *
 * 繰り返し作業の削減：はい — 表作成、転記、集計、グラフ用データ整備、CSV整形を削減
 *
 * AI必要度：中 — 意図理解・表構造推定・分析コメントのみAI。書式・数式・変換は通常プログラム
 *
 * AIなしで実装可能：一部 — CSV整形・罫線・列幅・数式挿入・フィルターはプログラムで完結
 *
 * 運営コスト：画像/PDF変換時のみ Vision/LLM。テンプレ適用・数式・書式は追加AIなし
 *
 * 外部APIコスト：有（OpenAI Vision/LLM）— 変換・分析時のみ。エコモードで抑制
 *
 * コスト削減案：
 * - エコモード：分析コメントを省略、テンプレ＋規則ベース集計
 * - まとめて生成：複数シートを1ワークブックに集約
 * - キャッシュ再利用：同一 contentHash の表構造を再利用
 * - 予約実行：定期家計簿/売上集計は既存ジョブ経路
 * - AI起動条件：表が既に構造化されている場合はAIスキップ
 * - 外部API最小化：CSV/既知テンプレはAIなし
 * - 承認後実行：編集・上書きはユーザー確認後
 * - 再生成禁止：同一 idempotencyKey で重複成果物を作らない
 *
 * 優先度：P0
 */

export const EXCEL_SECRETARY_FEATURE_EVALUATION = {
  name: "Excel業務代行エンジン",
  priority: "P0",
  aiRequired: "medium",
  reducesHabitualWork: true,
} as const;

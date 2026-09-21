/**
 * 【ATLAS機能評価】
 *
 * 機能名：AI学習アシスト（Smart Profile Suggestion）
 * ユーザー価値：成果物完成後に必要な情報だけを提案し、次回の入力・修正を減らす
 * 差別化：強制入力ではなく「AI秘書からの改善提案」。スキップ30日・保存後は再提案しない
 * 繰り返し作業の削減：はい — 会社名・署名・担当者など毎回の手入力
 * AI必要度：低 — 初版は成果物タイプ×不足検出×履歴カウントの通常プログラム
 * AIなしで実装可能：はい — プレースホルダ検出と回数集計で代替
 * 運営コスト：低（成果物完了時のクライアント側ルール判定のみ。LLMなし）
 * 外部APIコスト：無
 * コスト削減案：
 *   - エコモード：AI不使用が既定
 *   - まとめて生成：複数フィールドを1シートで提示
 *   - キャッシュ：保存済み事実・スキップ状態を localStorage 再利用
 *   - 予約実行：不要（完了時のみ）
 *   - AI起動条件：初版は起動しない
 *   - 外部API最小化：なし
 *   - 承認後実行：ワンタップ保存（自動書き込みしない）
 *   - 再生成禁止：保存済み・スキップ中は再提案しない
 * 優先度：P1
 */

export const SMART_PROFILE_SUGGESTION_EVALUATION = {
  name: "AI学習アシスト（Smart Profile Suggestion）",
  priority: "P1",
  usesAiByDefault: false,
  skipDays: 30,
  recurringThreshold: 3,
} as const;

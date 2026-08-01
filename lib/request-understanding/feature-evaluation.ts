/**
 * 【ATLAS機能評価】
 *
 * 機能名：統一依頼理解・実行ルーター（Request Understanding）
 *
 * ユーザー価値：曖昧な短い日本語でも、目的・入力・成果物形式・不足情報・実行方法を
 * 正確に判断し、最小限の確認だけで正しい仕事を開始できる
 *
 * 差別化：キーワード先勝ちではなく、複数シグナル＋confidence＋不足情報ルール＋
 * 複合ワークフロー分解で、外部実行/自動化/成果物を混同しない
 *
 * 繰り返し作業の削減：はい — 「どの形式？」「何が足りる？」の聞き返し・やり直しを削減
 *
 * AI必要度：低〜中 — 基本は通常プログラムの多シグナル判定。高度な曖昧文のみ将来LLM可
 *
 * AIなしで実装可能：はい（本PRのコアは決定的ルール＋スコアリング。LLM必須ではない）
 *
 * 運営コスト：依頼ごとに追加AI呼び出しなし（決定的パーサ）。既存Commander/Visionは後段のみ
 *
 * 外部APIコスト：無（理解レイヤー単体）。後段の成果物/Visionのみ既存どおり
 *
 * コスト削減案：
 * - エコモード：高confidenceはそのまま実行、低confidenceのみ確認
 * - まとめて生成：複数成果物を1ジョブのrequested_outputsで計画
 * - キャッシュ：同一 idempotencyKey で重複ジョブ禁止
 * - 予約実行：automation/schedule は別モードで明示
 * - AI起動条件：理解レイヤー自体はAIを起動しない
 * - 外部API最小化：形式判定・不足情報はローカル
 * - 承認後実行：external_action / automation は既存確認ルール遵守
 * - 再生成禁止：duplicate_request 検知
 *
 * 優先度：P0
 */

export const REQUEST_UNDERSTANDING_FEATURE_EVALUATION = {
  name: "統一依頼理解・実行ルーター",
  priority: "P0",
  aiRequired: "low",
  reducesHabitualWork: true,
  productionGate: true,
} as const;

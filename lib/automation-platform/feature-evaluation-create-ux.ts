/**
 * 【ATLAS機能評価】
 *
 * 機能名：自動化作成体験（Phase 2）
 * ユーザー価値：専門知識なしで仕事を細かく引き継ぎ、確認後に安全に自動化を開始できる
 * 差別化：巨大フォームではなく段階式。構造化設定＋備考＋矛盾確認＋記憶範囲選択
 * 繰り返し作業の削減：はい（毎回の依頼作成・設定やり直しを減らす）
 * AI必要度：低〜中 — 自然文からの提案は規則ベースで十分。LLMは将来の高度補助のみ
 * AIなしで実装可能：はい — ウィザード・検証・Draft・API連携は通常プログラム
 * 運営コスト：作成UI自体はAI呼び出しなし。実行時のみ既存パイプライン
 * 外部APIコスト：無（作成時）。連携実行時のみ従量
 * コスト削減案：
 *   - エコモード（実行時に継承可能な structuredOptions）
 *   - まとめて生成（SNSバッチを設定項目として保持）
 *   - キャッシュ再利用（Draft・同一設定の再生成防止）
 *   - 予約実行（Schedule）
 *   - AI起動条件（自然文提案は規則ベース、LLMは使わない）
 *   - 外部API最小化（未接続は選択不可）
 *   - 承認後実行（Execution Policy）
 *   - 同じ処理を再生成しない（idempotency）
 * 優先度：P0
 */

export const AUTOMATION_CREATE_UX_FEATURE_EVALUATION = {
  name: "automation_create_experience_phase2",
  priority: "P0",
  aiRequired: "low",
  phase: 2,
} as const;

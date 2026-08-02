/**
 * 【ATLAS機能評価】
 *
 * 機能名：Automation Platform 基盤（Phase 1）
 * ユーザー価値：習慣的な仕事を項目ごとに細かく設定し、指定タイミングで最後まで実行できる土台を用意する
 * 差別化：単発の成果物生成ではなく、承認・記憶契約・重複防止・Timezoneを持つ自動化プラットフォーム
 * 繰り返し作業の削減：はい（定期の依頼作成・確認・再実行・設定のやり直しを減らす基盤）
 * AI必要度：低（本Phase）— スケジュール・状態・認可・矛盾検出は通常プログラム。AIは備考統合の契約のみ
 * AIなしで実装可能：はい — モデル・API・Migration・状態遷移・idempotencyは通常プログラム
 * 運営コスト：本PhaseはAI呼び出しなし。将来実行時のみ必要最小限のLLM
 * 外部APIコスト：無（本Phase）。将来の連携実行時のみ従量
 * コスト削減案：
 *   - エコモード（既存 executionMode を V2 へ写経可能に保持）
 *   - まとめて生成（SNSバッチ方針を instruction.structuredOptions へ接続可能）
 *   - キャッシュ再利用（同一 occurrence は再生成しない）
 *   - 予約実行（schedule + nextRunAt）
 *   - AI起動条件（active かつ due かつ矛盾なしのときのみ）
 *   - 外部API最小化（高リスク Step は承認後のみ）
 *   - 承認後実行（executionPolicy）
 *   - 同じ処理を再生成しない（runKey / scheduleOccurrenceKey）
 * 優先度：P0
 */

export const AUTOMATION_PLATFORM_FEATURE_EVALUATION = {
  name: "automation_platform_foundation_phase1",
  priority: "P0",
  aiRequired: "low",
  phase: 1,
} as const;

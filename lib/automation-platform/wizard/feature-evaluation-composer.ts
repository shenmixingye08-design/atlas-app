/**
 * 【ATLAS機能評価】
 *
 * 機能名：Automation Composer（仕事を任せる）
 * ユーザー価値：IT知識なし・30秒以内に仕事を1件任せられる
 * 差別化：設定画面ではなく秘書への依頼体験。Prediction・テンプレ・下書き復元付き
 * 繰り返し作業の削減：はい（毎回の依頼作成・設定やり直しを減らす）
 * AI必要度：低 — 要約・テンプレ適用は規則ベース。LLM追加なし
 * AIなしで実装可能：はい
 * 運営コスト：作成UIはAI呼び出しなし
 * 外部APIコスト：無（作成時）
 * コスト削減案：
 *   - [x] エコモード不要（UIのみ）
 *   - [x] テンプレでまとめて初期設定
 *   - [x] Draft自動保存・復元
 *   - [x] 予約実行は既存スケジュール
 *   - [x] AI起動なし
 *   - [x] 未連携は選択不可
 *   - [x] 承認必須を通知ステップで選択
 *   - [x] 同じ下書きを再生成しない
 * 優先度：P0
 */

export const AUTOMATION_COMPOSER_FEATURE_EVALUATION = {
  name: "automation_composer",
  priority: "P0",
  aiRequired: "none",
  phase: "automation_composer_s_rank",
  targetSecondsToCreate: 30,
} as const;

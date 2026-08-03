/**
 * 【ATLAS機能評価】
 *
 * 機能名：Memory全AI共通適用（MemoryProvider / PersonalizationContext / MemoryApply）
 * ユーザー価値：どのAIを使っても同じ人・同じ会社・同じ好みを理解した秘書として仕事が続く
 * 差別化：Commander専用Memoryではなく、Automation / Vision / OCR / 成果物 / Prediction まで同一コンテキスト
 * 繰り返し作業の削減：はい（口調・署名・会社情報・列構成・禁止事項の毎回入力が減る）
 * AI必要度：低 — 解決・注入・差分計測は通常プログラム。生成自体は既存AI経路
 * AIなしで実装可能：はい — Provider / Overlay / PromptInjection で足りる
 * 運営コスト：追加AI呼び出しなし。既存 Personal/Work Memory の token 予算内
 * 外部APIコスト：無（Memory自体）
 * コスト削減案：
 *   - エコモード継承
 *   - 同一run内 resolve 再利用
 *   - Memory OFF/ON 比較はプログラム差分のみ
 *   - 予約実行は Scheduler 既存
 *   - AI起動条件は変更しない
 *   - 外部API最小化（Durable 既存）
 *   - 推測は候補→承認後のみ
 *   - 同じ成果物への無意味再生成禁止
 * 優先度：P0
 */

export const MEMORY_APPLY_FEATURE_EVALUATION = {
  name: "memory_universal_apply",
  priority: "P0",
  aiRequired: "low",
  phase: "memory_universal_secretary",
} as const;

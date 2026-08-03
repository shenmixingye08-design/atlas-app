/**
 * 【ATLAS機能評価】
 *
 * 機能名：Memory共有率100%（PersonalizationContext一本道 / Phase2）
 * ユーザー価値：覚えた好み・会社・文体が Word / Excel / Vision / OCR / Automation / Chat / Planner / Commander すべてに同じように効く
 * 差別化：表面ごとの個別Memoryを禁止し、唯一の PersonalizationContext でAI秘書を成立させる
 * 繰り返し作業の削減：はい（毎回の口調・署名・会社情報・禁止事項の再入力が全AIで消える）
 * AI必要度：低 — 解決・注入・共有証明は通常プログラム。生成自体は既存AI経路
 * AIなしで実装可能：はい — MemoryProvider / PersonalizationContext / PromptBuilder / adapters
 * 運営コスト：追加AI呼び出しなし。同一userの resolve を経路横断で再利用する設計
 * 外部APIコスト：無（Memory自体）
 * コスト削減案：
 *   - エコモード継承（生成側の既存挙動は変更しない）
 *   - まとめて生成：同一Contextを全表面へ注入
 *   - キャッシュ再利用：Personal/Work Memory durable 既存
 *   - 予約実行：Scheduler は MemoryApply(scheduler) 経由
 *   - AI起動条件：変更しない（Memory解決はプログラム）
 *   - 外部API最小化：MemoryApplyのみ・並列resolve禁止
 *   - 承認後実行：候補Memoryは candidate のまま
 *   - 同じ処理を再生成しない：Regenerateは差分適用のみ
 * 優先度：P0
 */

export const MEMORY_APPLY_FEATURE_EVALUATION = {
  name: "memory_shared_100",
  priority: "P0",
  aiRequired: "low",
  phase: "memory_shared_personalization_context",
  shareRateTargetPercent: 100,
} as const;

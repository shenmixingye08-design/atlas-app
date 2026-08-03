/**
 * 【ATLAS機能評価】
 *
 * 機能名：Memory共有 Production Blocker #3（PersonalizationContext 単一SoT）
 * ユーザー価値：昨日チャットで話した好み・禁止・会社情報を、今日の Automation / Vision / OCR / Word まで全部使える
 * 差別化：Chat専用Memoryを廃止し、全AIが同じ PersonalizationContext を loadMemory→saveMemory で共有
 * 繰り返し作業の削減：はい（口調・署名・禁止事項・会社情報の再入力が全AIで消える）
 * AI必要度：低 — 解決・注入・Version・共有証明は通常プログラム
 * AIなしで実装可能：はい — loadMemory / PersonalizationContext / PromptBuilder / saveMemory
 * 運営コスト：追加AI呼び出しなし。同一userの Context を全表面へ再利用
 * 外部APIコスト：無（Memory自体）
 * コスト削減案：
 *   - エコモード継承
 *   - まとめて生成：同一Contextを全表面へ注入
 *   - キャッシュ再利用：Personal/Work Memory durable
 *   - 予約実行：Scheduler は loadMemory(scheduler)
 *   - AI起動条件：Memory取得成功後のみ（Fail Closed）
 *   - 外部API最小化：並列resolve禁止
 *   - 承認後実行：推論Memoryは candidate
 *   - 同じ処理を再生成しない：checksum / MemoryVersion
 * 優先度：P0
 */

export const MEMORY_APPLY_FEATURE_EVALUATION = {
  name: "memory_shared_blocker3_personalization_context",
  priority: "P0",
  aiRequired: "low",
  phase: "production_blocker_3",
  shareRateTargetPercent: 100,
  unsharedTarget: 0,
  failClosedWithoutMemory: true,
} as const;

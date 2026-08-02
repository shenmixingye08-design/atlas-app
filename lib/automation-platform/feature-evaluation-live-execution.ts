import type { FeatureEvaluationRecord } from "@/lib/development/feature-evaluation";

/**
 * 【ATLAS機能評価】Automation V2 Live Execution Integration
 */
export const AUTOMATION_LIVE_EXECUTION_FEATURE_EVALUATION = {
  name: "automation_v2_live_execution",
  userValue:
    "自動化が画面上の定義だけでなく、本物の成果物生成・外部連携・通知まで完了し、習慣作業を実際に代行する",
  differentiation:
    "チャットで毎回依頼するのではなく、既存MINERVOTエンジンへ接続した自動化が最後まで仕事を終わらせる",
  reducesHabitualWork: "yes",
  aiNecessity: "medium",
  aiNecessityReason:
    "文書生成・VisionはAIが必要。Schedule・Queue・Idempotency・OAuth・保存は通常プログラム",
  implementableWithoutAi: "partial",
  implementableWithoutAiNote:
    "外部投稿・保存・通知・QueueはAIなし。成果物本文生成と画像解析はAI依存",
  operatingCost:
    "実行時のみ既存エンジン/外部APIを起動。未接続はfail-closedで無駄呼びなし",
  externalApiCost: "yes",
  externalApiCostNote:
    "OpenAI Vision、X/Gmail/Calendar/WordPress/Dropbox、Storage。接続済みユーザーの実行時のみ",
  costReductionChecklist: {
    ecoMode: true,
    batchGeneration: true,
    cacheReuse: true,
    scheduledExecution: true,
    aiTriggerConditions: true,
    minimizeExternalApiTiming: true,
    approveThenExecute: true,
    noRegenerateSameWork: true,
  },
  priority: "P0",
  notes:
    "モック成功禁止。Adapter未接続・認証不足はneeds_configuration/FAIL。既存deliverables/integrationsを重複実装しない。",
} as const satisfies FeatureEvaluationRecord;

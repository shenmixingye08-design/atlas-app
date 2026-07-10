export type LearningConfidence = "high" | "medium" | "low";

export type LearningRecord = {
  id: string;
  workedWell: string;
  didNotWorkWell: string | null;
  recommendation: string;
  confidence: LearningConfidence;
  /** Display label (Japanese). */
  department: string;
  /** Tag slug for knowledge retrieval. */
  departmentId: string;
  /** Display label for workflow topic. */
  workflow: string;
  /** Tag slug for topic. */
  topicId: string;
  topic: string;
};

type ExtensionStub = { enabled: false; note: string };

export type CompanyLearning = {
  records: readonly LearningRecord[];
  extensions: CompanyLearningExtensions;
};

export type CompanyLearningExtensions = {
  realAnalytics: ExtensionStub;
  historicalComparisons: ExtensionStub;
  trendAnalysis: ExtensionStub;
  automaticStrategyUpdates: ExtensionStub;
};

export const LEARNING_EXTENSION_STUBS: CompanyLearningExtensions = {
  realAnalytics: { enabled: false, note: "実アナリティクス（将来対応）" },
  historicalComparisons: {
    enabled: false,
    note: "履歴比較（将来対応）",
  },
  trendAnalysis: { enabled: false, note: "トレンド分析（将来対応）" },
  automaticStrategyUpdates: {
    enabled: false,
    note: "戦略の自動更新（将来対応）",
  },
};

export function confidenceToScore(confidence: LearningConfidence): number {
  switch (confidence) {
    case "high":
      return 90;
    case "medium":
      return 75;
    case "low":
      return 60;
  }
}

import type { WorkMemoryType } from "@/lib/work-memory/types";

export const LEARNING_ANALYSIS_PERIODS = [30, 90, 180, 365] as const;

export type LearningAnalysisPeriod = (typeof LEARNING_ANALYSIS_PERIODS)[number];

/** Extensible work domains for learning analysis. */
export const LEARNING_DOMAINS = [
  "document_creation",
  "sales_material",
  "bookkeeping",
  "social_post",
  "image_production",
  "video_production",
  "vehicle_management",
  "recurring_task",
  "general_work",
] as const;

export type LearningDomain = (typeof LEARNING_DOMAINS)[number];

export const LEARNING_MEMORY_TYPES: readonly WorkMemoryType[] = [
  "outcome",
  "correction",
  "result",
  "habit",
  "template",
  "workflow",
];

export type LearningEvent = {
  eventId: string;
  userId: string;
  domain: LearningDomain;
  assignmentFingerprint: string;
  assignmentSummary: string;
  deliverableType: string | null;
  durationMs: number | null;
  memoriesUsedCount: number;
  memoryTypesUsed: WorkMemoryType[];
  correctionApplied: boolean;
  completed: boolean;
  createdAt: string;
};

export type LearningInsightItem = {
  text: string;
  evidence: string;
  confidence: number;
};

export type LearningReportSections = {
  improvements: LearningInsightItem[];
  maintain: LearningInsightItem[];
  recommendations: LearningInsightItem[];
  futureProposals: LearningInsightItem[];
};

export type LearningReport = {
  reportId: string;
  userId: string;
  periodDays: LearningAnalysisPeriod;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  hasSufficientData: boolean;
  dataPoints: number;
  insufficientMessage: string | null;
  sections: LearningReportSections;
  summary: {
    eventCount: number;
    memoryCount: number;
    correctionCount: number;
    avgDurationMs: number | null;
  };
};

export type RunLearningAnalysisInput = {
  periodDays: LearningAnalysisPeriod;
  requestedAt?: string;
};

export const MIN_DATA_POINTS_FOR_ANALYSIS = 3;
export const MIN_EVENTS_FOR_TREND = 4;

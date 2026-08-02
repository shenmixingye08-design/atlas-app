import type {
  MemoryApplyPreviewItem,
  PersonalMemoryScope,
} from "@/lib/personal-memory/types";

export type DeliverableKind =
  | "word"
  | "excel"
  | "powerpoint"
  | "pdf"
  | "image"
  | "ocr"
  | "text"
  | "unknown";

export type MemoryApplyBreakdown = {
  totalApplied: number;
  byCategory: number;
  byAutomation: number;
  byCompany: number;
  byArtifact: number;
  byGlobal: number;
};

export type CorrectionMetrics = {
  deletedChars: number;
  addedChars: number;
  replacedChars: number;
  /** 0–1, (deleted+added+replaced) / max(beforeLen, 1) clamped */
  diffRate: number;
  beforeLength: number;
  afterLength: number;
};

export type MatchDimension =
  | "writing_style"
  | "structure"
  | "length"
  | "layout"
  | "destination"
  | "format"
  | "template";

export type MatchRateBreakdown = Record<MatchDimension, number | null>;

export type MemoryScoreBand =
  | "near_perfect"
  | "minor_edits"
  | "room_to_improve"
  | "memory_insufficient"
  | "almost_first_run";

export type MemoryScoreResult = {
  /** 0–100 */
  score: number;
  band: MemoryScoreBand;
  label: string;
};

export type DeliverableQualityEvaluation = {
  id: string;
  userId: string;
  createdAt: string;
  deliverableKind: DeliverableKind;
  workCategory: string | null;
  automationId: string | null;
  companyId: string | null;
  /** Generated (before correction) */
  generatedText: string;
  /** User-corrected (after) */
  correctedText: string;
  memoryApplied: MemoryApplyBreakdown;
  appliedPreview: MemoryApplyPreviewItem[];
  correction: CorrectionMetrics;
  matchRates: MatchRateBreakdown;
  /** Average of non-null match dimensions 0–1 */
  overallMatchRate: number;
  memoryScore: MemoryScoreResult;
  /** Mean confidence of applied active memories */
  appliedConfidence: number;
  memoryIdsUsed: string[];
  runIndexInCategory: number;
};

export type LearningVelocityPoint = {
  runIndex: number;
  memoryScore: number;
  diffRate: number;
  overallMatchRate: number;
  evaluatedAt: string;
};

export type CategoryLearningSeries = {
  workCategory: string;
  points: LearningVelocityPoint[];
  /** Estimated runs to reach score >= 85, null if unknown */
  runsToStable: number | null;
};

export type MemoryQualityDashboard = {
  generatedAt: string;
  latestScore: MemoryScoreResult | null;
  averageScore: number | null;
  averageDiffRate: number | null;
  averageMatchRate: number | null;
  averageConfidence: number | null;
  applyRate: MemoryApplyBreakdown;
  recentLearned: Array<{
    title: string;
    summary: string;
    scope: PersonalMemoryScope;
    status: "candidate" | "active";
    confidence: number;
    updatedAt: string;
  }>;
  improvementSuggestions: Array<{
    id: string;
    title: string;
    description: string;
    reason: "memory_insufficient" | "high_repeat_correction";
  }>;
  matchRates: MatchRateBreakdown;
  learningVelocity: CategoryLearningSeries[];
  byDeliverableKind: Array<{
    kind: DeliverableKind;
    count: number;
    averageScore: number;
    averageDiffRate: number;
    averageMatchRate: number;
    averageConfidence: number;
  }>;
  byAutomation: Array<{
    automationId: string;
    count: number;
    averageScore: number;
    averageDiffRate: number;
  }>;
  evaluationsCount: number;
  /** Proof: first vs latest score delta when series length >= 2 */
  proof: {
    categoriesImproved: number;
    categoriesMeasured: number;
    averageScoreLift: number | null;
    averageDiffRateDrop: number | null;
  };
};

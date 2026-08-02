import type {
  MemoryResolveLayer,
  PersonalMemoryScope,
} from "@/lib/personal-memory/types";

/** Below this, never auto-apply — show confirmation instead. */
export const PREDICTION_AUTO_APPLY_THRESHOLD = 0.6;

export type PredictionScoreBand =
  | "very_high"
  | "high"
  | "candidate"
  | "confirm_recommended"
  | "do_not_apply";

export type PredictionScoreResult = {
  /** 0–100 */
  score: number;
  band: PredictionScoreBand;
  label: string;
  /** true when score >= 60 and eligible for auto-apply */
  autoApply: boolean;
};

export type PredictedMemoryItem = {
  memoryId: string | null;
  scope: PersonalMemoryScope;
  title: string;
  summary: string;
  layer: MemoryResolveLayer;
  /** Memory confidence 0–1 */
  confidence: number;
  prediction: PredictionScoreResult;
  /** Why this memory was predicted */
  explain: string;
  /** Evidence supporting the explain */
  evidenceCount: number;
  evidenceTotal: number;
  /** User can toggle in One-Click UI */
  enabled: boolean;
  /** false when prediction < 60% — needs explicit confirm */
  requiresConfirm: boolean;
};

export type ProactiveSuggestionKind =
  | "automation"
  | "pdf_co_generate"
  | "default_destination"
  | "format_standard";

export type ProactiveSuggestion = {
  id: string;
  kind: ProactiveSuggestionKind;
  title: string;
  description: string;
  /** Dedup key — never re-show same suggestion repeatedly */
  fingerprint: string;
  confidence: number;
};

export type PredictiveApplyPreview = {
  id: string;
  createdAt: string;
  userId: string;
  workCategory: string | null;
  companyId: string | null;
  automationId: string | null;
  /** Human headline e.g. 「営業資料ですね。」 */
  headline: string;
  /** e.g. 「過去18件の成果物から以下を適用します。」 */
  evidenceSummary: string;
  items: PredictedMemoryItem[];
  /** Items with autoApply && enabled */
  autoApplyItems: PredictedMemoryItem[];
  /** Items needing confirmation (score < 60 or toggled) */
  confirmItems: PredictedMemoryItem[];
  /** Overall prediction for this run */
  overallPrediction: PredictionScoreResult;
  estimatedMatchRate: number;
  proactiveSuggestions: ProactiveSuggestion[];
  injectionText: string;
};

export type PredictionOutcome = "accepted" | "edited" | "rejected" | "toggled_off";

export type PredictionHistoryEntry = {
  id: string;
  userId: string;
  createdAt: string;
  workCategory: string | null;
  predictionId: string;
  memoryId: string | null;
  title: string;
  summary: string;
  predictionScore: number;
  outcome: PredictionOutcome;
  enabled: boolean;
};

export type PredictiveQualityKpis = {
  generatedAt: string;
  predictionAccuracy: number | null;
  memoryAccuracy: number | null;
  diffReduction: number | null;
  instructionReduction: number | null;
  reuseRate: number | null;
  firstAcceptRate: number | null;
  automationSuggestionRate: number | null;
  predictionsCount: number;
  historyCount: number;
};

export type PredictiveMemoryDashboard = {
  generatedAt: string;
  latestPrediction: PredictiveApplyPreview | null;
  overallPredictionScore: PredictionScoreResult | null;
  predictionSuccessRate: number | null;
  kpis: PredictiveQualityKpis;
  recentApplied: PredictionHistoryEntry[];
  recentRejected: PredictionHistoryEntry[];
  history: PredictionHistoryEntry[];
  proactiveSuggestions: ProactiveSuggestion[];
};

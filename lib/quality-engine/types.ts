import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import type { QualityCriterionScores } from "@/lib/orchestration/parse-quality";

/** How aggressively the Quality Engine runs AI polish. */
export type QualityEngineTier = "fast" | "enhanced" | "full";

/** Prompt family aligned to user-facing deliverable kinds. */
export type QualityPromptKind =
  | "sales_material"
  | "contract"
  | "invoice"
  | "report"
  | "proposal"
  | "blog"
  | "sns"
  | "excel"
  | "word"
  | "pdf"
  | "receipt"
  | "generic";

/** Writer brief assembled from Planner output + profile/context (Planner does not write prose). */
export type WriterBrief = {
  assignmentSummary: string;
  deliverableKind: QualityPromptKind;
  deliverableType: DeliverableType;
  purpose: string;
  audience: string;
  tone: string;
  pageStructure: readonly string[];
  requiredSections: readonly string[];
  businessProfileSummary: string;
  visionSummary: string;
  userSettingsSummary: string;
  templateId: string | null;
  pastDeliverableHints: string;
};

export type QualitySectionDef = {
  id: string;
  title: string;
  /** Short instruction for the Writer. */
  guidance: string;
};

/** Judge criteria (0–100 each) — user-facing quality dimensions. */
export type QualityJudgeCriteria = {
  completeness: number;
  readability: number;
  persuasiveness: number;
  naturalness: number;
  expertise: number;
  design: number;
  structure: number;
  information: number;
};

export type QualityJudgeResult = {
  overallScore: number;
  criteria: QualityJudgeCriteria;
  /** Mapped into legacy QualityCriterionScores for existing UI/history. */
  legacyCriteria: QualityCriterionScores;
  passed: boolean;
  feedback: string;
  weakSections: readonly string[];
  source: "rules" | "llm" | "hybrid";
  durationMs: number;
};

export type QualityReviewerResult = {
  approved: boolean;
  issues: readonly string[];
  feedback: string;
  durationMs: number;
  usedLlm: boolean;
};

export type QualityEngineStageTiming = {
  plannerMs: number;
  writerMs: number;
  reviewerMs: number;
  judgeMs: number;
  formatterMs: number;
  improveMs: number;
};

/** Owner-only telemetry — never shown to end users. */
export type QualityEngineTelemetry = {
  tier: QualityEngineTier;
  promptKind: QualityPromptKind;
  improveCount: number;
  finalScore: number | null;
  passed: boolean;
  timings: QualityEngineStageTiming;
  reviewerUsedLlm: boolean;
  judgeSource: QualityJudgeResult["source"];
  recordedAt: string;
};

export type QualityEngineRunResult = {
  telemetry: QualityEngineTelemetry;
  judge: QualityJudgeResult;
  reviewer: QualityReviewerResult | null;
  improveCount: number;
  /** Markdown/content after deterministic Formatter. */
  formattedMarkdown: string;
  formattedContent: string;
};

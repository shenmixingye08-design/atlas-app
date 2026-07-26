import type { DeliverableType } from "@/lib/orchestration/deliverable-types";
import type { QualityCriterionScores } from "@/lib/orchestration/parse-quality";

/** How aggressively the Quality Engine runs AI polish. */
export type QualityEngineTier = "fast" | "enhanced" | "full";

/** Prompt family / specialist AI kind. */
export type QualityPromptKind =
  | "sales_material"
  | "proposal"
  | "planning"
  | "contract"
  | "estimate"
  | "invoice"
  | "word"
  | "excel"
  | "pdf"
  | "blog"
  | "sns"
  | "receipt"
  | "minutes"
  | "email"
  | "report"
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
  /** Reference Engine insights (never verbatim copy). */
  referenceSummary: string;
};

export type QualitySectionDef = {
  id: string;
  title: string;
  /** Short instruction for the Writer. */
  guidance: string;
};

/** Judge criteria (0–100 each) — shared dimensions, weighted per specialist. */
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
  /** Specialist focus label e.g. 営業力 / SEO (owner/internal). */
  focus: string;
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
  /** Specialist reviewer id (owner/internal). */
  specialistLabel: string;
};

export type QualityEngineStageTiming = {
  plannerMs: number;
  writerMs: number;
  reviewerMs: number;
  judgeMs: number;
  formatterMs: number;
  improveMs: number;
};

/** Owner-only Knowledge Engine usage flags on each run. */
export type KnowledgeUsageTelemetry = {
  businessProfile: boolean;
  reference: boolean;
  template: boolean;
  knowledge: boolean;
  contextChars: number;
  layersUsed: readonly string[];
  entryCount: number;
};

/** Owner-only telemetry — never shown to end users. */
export type QualityEngineTelemetry = {
  tier: QualityEngineTier;
  promptKind: QualityPromptKind;
  specialistLabel: string;
  improveCount: number;
  /** How many Reviewer passes ran (rules and/or LLM). */
  reviewerCount: number;
  finalScore: number | null;
  judgeFocus: string;
  passed: boolean;
  timings: QualityEngineStageTiming;
  reviewerUsedLlm: boolean;
  judgeSource: QualityJudgeResult["source"];
  /** Knowledge Engine usage (Phase3). */
  knowledgeUsage?: KnowledgeUsageTelemetry;
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

/** Owner analytics row per deliverable kind. */
export type QualityKindStats = {
  promptKind: QualityPromptKind;
  specialistLabel: string;
  sampleCount: number;
  avgScore: number | null;
  avgImproveCount: number;
  avgReviewerCount: number;
};

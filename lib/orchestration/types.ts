import type { AgentId, AgentRunResult } from "@/lib/agents/types";
import type { WorkTask } from "@/lib/agents/tasks/types";
import type { EmployeeId } from "@/lib/employees/types";
import type { KnowledgeUsedResult } from "@/lib/knowledge/types";

import type { Deliverable } from "./deliverable-types";
import type { QualityCriterionScores } from "./parse-quality";

export type { KnowledgeUsedResult } from "@/lib/knowledge/types";

/** Status of a completed or failed orchestration run. */
export type OrchestrationStatus = import("./workflow-state").LegacyOrchestrationStatus;

/** Status of an individual worker or reviewer step. */
export type ExecutionStepStatus = "completed" | "failed" | "skipped";

/** Identifies which pipeline step failed or timed out. */
export type OrchestrationStep =
  | "ceo"
  | "research_assessment"
  | "research_report"
  | "planner_plan"
  | "planner_tasks"
  | "worker"
  | "reviewer"
  | "quality_assurance"
  | "ceo_approval"
  | "final_deliverable";

/** External research categories evaluated before planning. */
export type ResearchCategory =
  | "web_research"
  | "market_research"
  | "competitor_research"
  | "technical_documentation"
  | "statistics"
  | "legal_references";

/** Parsed assessment of whether external research is required. */
export type ResearchAssessment = {
  required: boolean;
  categories: ResearchCategory[];
  rationale: string;
};

/** Structured fields extracted from a Research Report. */
export type ResearchReport = {
  executiveSummary: string;
  keyFindings: string[];
  supportingEvidence: string[];
  risks: string[];
  sources: string[];
  confidenceScore: number;
  fullText: string;
};

/** Research department stage persisted on {@link OrchestrationResult}. */
export type ResearchStageResult = {
  assessment: ResearchAssessment;
  assessmentPhase: AgentPhaseResult | null;
  assessmentStatus: ExecutionStepStatus;
  assessmentError?: string;
  report: ResearchReport | null;
  reportPhase: AgentPhaseResult | null;
  reportStatus: ExecutionStepStatus;
  reportError?: string;
};

/** Structured failure metadata for a single pipeline step. */
export type OrchestrationStepError = {
  step: OrchestrationStep;
  agentId: AgentId;
  message: string;
  taskId?: number;
  cause?: string;
  timedOut?: boolean;
};

/** Result of parsing Planner task decomposition output. */
export type ParseTasksResult = {
  tasks: WorkTask[];
  source: "parsed" | "fallback_single" | "fallback_split";
  warning?: string;
};

/** Re-export for convenience. */
export type { WorkTask, QualityCriterionScores };

/** Result of a single agent phase with timing. */
export type AgentPhaseResult = {
  result: AgentRunResult;
  durationMs: number;
};

/** One QA scoring pass stored in workflow history. */
export type QualityReviewRecord = {
  attempt: number;
  revisionNumber: number;
  score: number;
  criteria: QualityCriterionScores;
  passed: boolean;
  feedback: string;
  tasksRevised: number[];
  qa: AgentPhaseResult | null;
  qaStatus: ExecutionStepStatus;
  qaError?: string;
};

/** CEO final sign-off after QA. */
export type CeoApprovalRecord = {
  approved: boolean;
  ceo: AgentPhaseResult | null;
  status: ExecutionStepStatus;
  comments: string;
  error?: string;
};

/** Quality loop state persisted on {@link OrchestrationResult}. */
export type QualityLoopResult = {
  reviews: QualityReviewRecord[];
  revisionCount: number;
  currentScore: number | null;
  passed: boolean;
  ceoApproval: CeoApprovalRecord | null;
};

/** Worker + Reviewer results for one task. */
export type TaskExecutionResult = {
  task: WorkTask;
  /** Employee assigned to execute this task in parallel worker pool. */
  assignedEmployeeId: EmployeeId;
  worker: AgentPhaseResult | null;
  workerStatus: ExecutionStepStatus;
  workerError?: string;
  reviewer: AgentPhaseResult | null;
  reviewerStatus: ExecutionStepStatus;
  reviewerError?: string;
  approved: boolean;
};

/** Input to the orchestration layer. */
export type OrchestrationRequest = {
  /** The user's work assignment or request. */
  assignment: string;
  /** Optional metadata (user ID, project ID, etc.). */
  metadata?: Readonly<Record<string, unknown>>;
};

/** Full result returned after the multi-agent pipeline completes. */
export type OrchestrationResult = {
  assignment: string;
  status: OrchestrationStatus;
  /** CEO strategic analysis. */
  ceo: AgentPhaseResult | null;
  /** Research department assessment and report (optional for legacy saves). */
  research?: ResearchStageResult;
  /** Planner's structured execution plan. */
  plannerPlan: AgentPhaseResult | null;
  /** Planner's task decomposition output. */
  plannerTasks: AgentPhaseResult | null;
  /** Parsed task list from the Planner. */
  tasks: WorkTask[];
  /** Per-task Worker and Reviewer results. */
  executions: TaskExecutionResult[];
  /** Structured deliverable built from worker output (actual work product). */
  deliverable: Deliverable;
  /** Aggregated review comments from all tasks. */
  reviewComments: string;
  /** Whether all task reviews approved the work. */
  approved: boolean;
  /** Human-readable completion summary (not the full deliverable body). */
  finalResponse: string;
  /** Total pipeline duration in milliseconds. */
  totalDurationMs: number;
  /** Human-readable error when status is "failed". */
  error?: string;
  /** Structured metadata for the step that failed. */
  stepError?: OrchestrationStepError;
  /** Non-fatal warnings (e.g. task parse fallback). */
  warnings?: string[];
  /** Quality loop reviews, revisions, and CEO approval (optional for legacy saves). */
  qualityLoop?: QualityLoopResult;
  /** Executive memory retrieved and applied during this run (optional). */
  knowledge?: KnowledgeUsedResult;
  /** Work Memory applied during this run (optional). */
  workMemory?: import("@/lib/work-memory/types").WorkMemoryUsedContext;
  /** Memory candidates created after this run (optional). */
  workMemoryCandidates?: import("@/lib/work-memory/types").WorkMemoryCandidate[];
  /** Dev/debug cost breakdown (non-production only). */
  costDebug?: import("@/lib/ai/cost-meter").WorkflowCostSummary;
  /** Dev/debug pipeline stage report (non-production only). */
  pipelineDebug?: import("./pipeline-diagnostics").PipelineDiagnosticsReport;
  /** Persisted workflow state machine snapshot. */
  workflow: import("./workflow-state").WorkflowStateRecord;
  /** Dev/debug cache & knowledge isolation metrics (non-production only). */
  isolationDebug?: WorkflowIsolationDebug;
};

/** Cache and knowledge isolation diagnostics for Workflow Inspector. */
export type WorkflowIsolationDebug = {
  cacheKey: string;
  assignmentHash: string;
  deliverableType: string;
  workflowVersion: string;
  policyVersion: string;
  cacheReplay: {
    planner: boolean;
    worker: boolean;
    research: boolean;
  };
  knowledge: import("@/lib/knowledge/knowledge-filter").KnowledgeFilterDiagnostics;
  /** Planner/Worker execution trace for pipeline debugging. */
  pipeline: import("./pipeline-execution").PipelineExecutionDebug;
};

import { generateActionEngineQueue } from "@/lib/actions/generate-queue";
import type { WorkflowCostSummary } from "@/lib/ai/cost-meter";
import { isAtlasDebugVerboseEnabled } from "@/lib/debug/atlas-debug";
import { generateCompanyLearning } from "@/lib/learning/generate-learning";
import { generateCompanyOperationsReport } from "@/lib/operations/generate-report";
import { generateGrowthReview } from "@/lib/growth/generate-review";
import { generatePrReview } from "@/lib/pr/generate-review";
import { deliverableHasContent } from "./deliverable-types";
import { isCoreTestMode } from "./core-workflow";
import { validateDeliverableFields } from "./deliverable-validation";
import { detectEmailSubject } from "./email-deliverable";
import type { PipelineStageId, PipelineStageStatus } from "./pipeline-diagnostics";
import type { OrchestrationResult } from "./types";
import type { WorkflowState } from "./workflow-state";

export type WorkflowInspectorStageId =
  | "ceo"
  | "research"
  | "planner"
  | "worker"
  | "reviewer"
  | "qa"
  | "approval"
  | "deliverable_builder"
  | "pr"
  | "growth"
  | "learning"
  | "company_report"
  | "action_engine";

export type WorkflowInspectorStageStatus =
  | "completed"
  | "warning"
  | "failed"
  | "skipped"
  | "pending";

export type WorkflowInspectorContentSignal = {
  exists: boolean;
  length: number;
};

export type WorkflowInspectorStageRow = {
  id: WorkflowInspectorStageId;
  label: string;
  status: WorkflowInspectorStageStatus;
  durationMs: number | null;
  input: WorkflowInspectorContentSignal;
  output: WorkflowInspectorContentSignal;
  error?: string;
};

export type WorkflowInspectorSummary = {
  workflowId: string;
  legacyStatus: OrchestrationResult["status"];
  finalState: WorkflowState;
  startedAt: string | null;
  completedAt: string | null;
  totalDurationMs: number;
  deliverableType: string | null;
  deliverableTitle: string | null;
};

export type WorkflowInspectorAiCallRow = {
  department: string;
  taskType: string;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  cache: "hit" | "miss";
  policyTaskType: string;
  policyModel: string;
  policyReasoningLevel: string;
  policyCostPriority: string;
  requestId?: string;
  providerLatencyMs?: number;
  retryCount?: number;
  actualInputTokens?: number;
  actualOutputTokens?: number;
  actualCostUsd?: number;
};

export type WorkflowInspectorCostSummary = {
  totalLlmCalls: number;
  totalEstimatedInputTokens: number;
  totalEstimatedOutputTokens: number;
  totalEstimatedCostUsd: number;
  mostExpensiveStage: string | null;
  cacheHits: number;
  cacheMisses: number;
};

export type WorkflowInspectorDeliverableIntegrity = {
  deliverableExists: boolean;
  type: string | null;
  titleExists: boolean;
  markdownExists: boolean;
  plainTextExists: boolean;
  metadataExists: boolean;
  downloadsReady: boolean;
  validationValid: boolean;
  validationIssues: string[];
  workerRawOutputExists: boolean;
  parsedDeliverableType: string | null;
  emailSubjectDetected: string | null;
};

export type WorkflowInspectorFailureDiagnostics = {
  failedStage: string | null;
  reason: string | null;
  rawError: string | null;
  recommendedFix: string | null;
  timedOut: boolean;
};

export type WorkflowInspectorReport = {
  summary: WorkflowInspectorSummary;
  stages: WorkflowInspectorStageRow[];
  aiCalls: WorkflowInspectorAiCallRow[];
  cost: WorkflowInspectorCostSummary | null;
  deliverableIntegrity: WorkflowInspectorDeliverableIntegrity;
  failure: WorkflowInspectorFailureDiagnostics | null;
  isolation: WorkflowInspectorIsolationDiagnostics | null;
};

export type WorkflowInspectorIsolationDiagnostics = {
  cacheKey: string;
  assignmentHash: string;
  deliverableType: string;
  workflowVersion: string;
  policyVersion: string;
  cacheReplay: { planner: boolean; worker: boolean; research: boolean };
  knowledgeRetrieved: number;
  knowledgeFiltered: number;
  knowledgeDiscarded: number;
  knowledgeDecisions: Array<{
    title: string;
    category: string;
    entryType: string | null;
    relevanceScore: number;
    included: boolean;
    target: string;
    reason: string;
  }>;
  pipeline: import("./pipeline-execution").PipelineExecutionDebug | null;
};

const STAGE_LABELS: Record<WorkflowInspectorStageId, string> = {
  ceo: "CEO",
  research: "Research",
  planner: "Planner",
  worker: "Worker",
  reviewer: "Reviewer",
  qa: "QA",
  approval: "Approval",
  deliverable_builder: "Deliverable Builder",
  pr: "PR",
  growth: "Growth",
  learning: "Learning",
  company_report: "Company Report",
  action_engine: "Action Engine",
};

function contentSignal(value: string | null | undefined): WorkflowInspectorContentSignal {
  const trimmed = value?.trim() ?? "";
  return { exists: trimmed.length > 0, length: trimmed.length };
}

function mapPipelineStatus(status: PipelineStageStatus): WorkflowInspectorStageStatus {
  switch (status) {
    case "ok":
      return "completed";
    case "warning":
      return "warning";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

function inferStartedAt(result: OrchestrationResult): string | null {
  const firstTransition = result.workflow.transitions[0]?.at;
  if (firstTransition) return firstTransition;
  if (!result.workflow.updatedAt) return null;
  const completedMs = Date.parse(result.workflow.updatedAt);
  if (Number.isNaN(completedMs)) return null;
  return new Date(completedMs - result.totalDurationMs).toISOString();
}

function buildOrchestrationStages(result: OrchestrationResult): WorkflowInspectorStageRow[] {
  const pipelineById = new Map(
    (result.pipelineDebug?.stages ?? []).map((stage) => [stage.id, stage]),
  );

  const ceoInput = contentSignal(result.assignment);
  const ceoOutput = contentSignal(result.ceo?.result.outputText);

  const researchInput = contentSignal(result.assignment);
  const researchOutput = contentSignal(
    result.research?.report?.fullText ??
      result.research?.assessment?.rationale ??
      "",
  );
  const researchDuration =
    (result.research?.assessmentPhase?.durationMs ?? 0) +
    (result.research?.reportPhase?.durationMs ?? 0);

  const plannerInput = contentSignal(result.assignment);
  const plannerOutput = contentSignal(
    [result.plannerPlan?.result.outputText, result.plannerTasks?.result.outputText]
      .filter(Boolean)
      .join("\n"),
  );
  const plannerDuration =
    (result.plannerPlan?.durationMs ?? 0) + (result.plannerTasks?.durationMs ?? 0);

  const workerExecutions = result.executions.filter((exec) => exec.worker);
  const workerDuration = workerExecutions.reduce(
    (sum, exec) => sum + (exec.worker?.durationMs ?? 0),
    0,
  );
  const workerInput = contentSignal(result.assignment);
  const workerOutput = contentSignal(
    workerExecutions.map((exec) => exec.worker?.result.outputText ?? "").join("\n"),
  );

  const reviewerDuration = result.executions.reduce(
    (sum, exec) => sum + (exec.reviewer?.durationMs ?? 0),
    0,
  );
  const reviewerOutput = contentSignal(
    result.executions.map((exec) => exec.reviewer?.result.outputText ?? "").join("\n"),
  );

  const qaOutput = contentSignal(result.qualityLoop?.reviews.at(-1)?.feedback);
  const approvalOutput = contentSignal(result.qualityLoop?.ceoApproval?.comments);

  const deliverableOutput = contentSignal(
    result.deliverable.markdown || result.deliverable.content,
  );

  const ORCHESTRATION_PIPELINE_IDS: Partial<
    Record<WorkflowInspectorStageId, PipelineStageId>
  > = {
    ceo: "ceo",
    research: "research",
    planner: "planner",
    worker: "worker",
    reviewer: "reviewer",
    qa: "qa",
    approval: "approval",
    deliverable_builder: "deliverable_builder",
  };

  const stageFromPipeline = (
    id: WorkflowInspectorStageId,
    overrides: Partial<WorkflowInspectorStageRow>,
  ): WorkflowInspectorStageRow => {
    const pipelineKey = ORCHESTRATION_PIPELINE_IDS[id];
    const pipeline = pipelineKey ? pipelineById.get(pipelineKey) : undefined;

    return {
      id,
      label: STAGE_LABELS[id],
      status: pipeline ? mapPipelineStatus(pipeline.status) : overrides.status ?? "pending",
      durationMs: overrides.durationMs ?? null,
      input: overrides.input ?? { exists: false, length: 0 },
      output: overrides.output ?? { exists: false, length: 0 },
      error: pipeline?.detail ?? overrides.error,
    };
  };

  return [
    stageFromPipeline("ceo", {
      durationMs: result.ceo?.durationMs ?? 0,
      input: ceoInput,
      output: ceoOutput,
      status: ceoOutput.exists ? "completed" : result.ceo ? "failed" : "skipped",
    }),
    stageFromPipeline("research", {
      durationMs: researchDuration || null,
      input: researchInput,
      output: researchOutput,
      status: result.research
        ? researchOutput.exists
          ? "completed"
          : "warning"
        : "skipped",
    }),
    stageFromPipeline("planner", {
      durationMs: plannerDuration || null,
      input: plannerInput,
      output: plannerOutput,
      status:
        result.tasks.length > 0 && plannerOutput.exists ? "completed" : "failed",
    }),
    stageFromPipeline("worker", {
      durationMs: workerDuration || null,
      input: workerInput,
      output: workerOutput,
      status: workerOutput.exists ? "completed" : "failed",
    }),
    stageFromPipeline("reviewer", {
      durationMs: reviewerDuration || null,
      input: workerOutput,
      output: reviewerOutput,
      status: result.executions.every(
        (exec) =>
          exec.reviewerStatus === "completed" || exec.reviewerStatus === "skipped",
      )
        ? "completed"
        : "failed",
    }),
    stageFromPipeline("qa", {
      durationMs: null,
      input: deliverableOutput,
      output: qaOutput,
      status: result.qualityLoop?.passed
        ? "completed"
        : deliverableOutput.exists
          ? "warning"
          : "failed",
    }),
    stageFromPipeline("approval", {
      durationMs: result.qualityLoop?.ceoApproval?.ceo?.durationMs ?? null,
      input: qaOutput,
      output: approvalOutput,
      status: result.approved ? "completed" : deliverableOutput.exists ? "warning" : "failed",
    }),
    stageFromPipeline("deliverable_builder", {
      durationMs: null,
      input: workerOutput,
      output: deliverableOutput,
      status: deliverableHasContent(result.deliverable) ? "completed" : "failed",
    }),
  ];
}

function buildDerivedStages(result: OrchestrationResult): WorkflowInspectorStageRow[] {
  if (isCoreTestMode()) {
    return [];
  }

  const hasDeliverable = deliverableHasContent(result.deliverable);
  const prReview = hasDeliverable ? generatePrReview(result) : null;
  const growthReview =
    prReview && hasDeliverable ? generateGrowthReview(prReview, result) : null;
  const learning = hasDeliverable ? generateCompanyLearning(result) : null;
  const companyReport = hasDeliverable ? generateCompanyOperationsReport(result) : null;
  const actionQueue = hasDeliverable ? generateActionEngineQueue(result) : null;

  const corpusInput = contentSignal(result.assignment);

  return [
    {
      id: "pr",
      label: STAGE_LABELS.pr,
      status: prReview ? "completed" : hasDeliverable ? "warning" : "skipped",
      durationMs: 0,
      input: corpusInput,
      output: contentSignal(prReview?.headline ?? prReview?.summary ?? ""),
      error: hasDeliverable && !prReview ? "PR review not generated" : undefined,
    },
    {
      id: "growth",
      label: STAGE_LABELS.growth,
      status: growthReview ? "completed" : prReview ? "warning" : "skipped",
      durationMs: 0,
      input: contentSignal(prReview?.headline ?? ""),
      output: contentSignal(growthReview?.summary ?? ""),
    },
    {
      id: "learning",
      label: STAGE_LABELS.learning,
      status: learning ? "completed" : growthReview ? "warning" : "skipped",
      durationMs: 0,
      input: corpusInput,
      output: {
        exists: (learning?.records.length ?? 0) > 0,
        length: learning?.records.length ?? 0,
      },
    },
    {
      id: "company_report",
      label: STAGE_LABELS.company_report,
      status: companyReport ? "completed" : growthReview ? "warning" : "skipped",
      durationMs: 0,
      input: corpusInput,
      output: contentSignal(companyReport?.ceoDailyReport ?? ""),
    },
    {
      id: "action_engine",
      label: STAGE_LABELS.action_engine,
      status:
        (actionQueue?.actions.length ?? 0) > 0
          ? "completed"
          : companyReport
            ? "warning"
            : "skipped",
      durationMs: 0,
      input: corpusInput,
      output: {
        exists: (actionQueue?.actions.length ?? 0) > 0,
        length: actionQueue?.actions.length ?? 0,
      },
    },
  ];
}

function buildAiCalls(cost: WorkflowCostSummary | undefined): WorkflowInspectorAiCallRow[] {
  if (!cost) return [];

  return cost.calls.map((call) => ({
    department: call.department,
    taskType: call.taskType,
    model: call.model,
    estimatedInputTokens: call.estimatedInputTokens,
    estimatedOutputTokens: call.estimatedOutputTokens,
    estimatedCostUsd: call.estimatedCostUsd,
    cache: call.cached ? "hit" : "miss",
    policyTaskType: call.policyTaskType,
    policyModel: call.policyModel,
    policyReasoningLevel: call.policyReasoningLevel,
    policyCostPriority: call.policyCostPriority,
    requestId: call.requestId,
    providerLatencyMs: call.providerLatencyMs,
    retryCount: call.retryCount,
    actualInputTokens: call.actualInputTokens,
    actualOutputTokens: call.actualOutputTokens,
    actualCostUsd: call.actualCostUsd,
  }));
}

function buildCostSummary(
  cost: WorkflowCostSummary | undefined,
): WorkflowInspectorCostSummary | null {
  if (!cost) return null;

  let mostExpensiveStage: string | null = null;
  let maxCost = 0;

  for (const [department, bucket] of Object.entries(cost.departmentBreakdown)) {
    if (bucket.estimatedCostUsd > maxCost) {
      maxCost = bucket.estimatedCostUsd;
      mostExpensiveStage = department;
    }
  }

  return {
    totalLlmCalls: cost.llmCallCount,
    totalEstimatedInputTokens: cost.estimatedInputTokens,
    totalEstimatedOutputTokens: cost.estimatedOutputTokens,
    totalEstimatedCostUsd: cost.estimatedCostUsd,
    mostExpensiveStage,
    cacheHits: cost.cacheHits,
    cacheMisses: cost.cacheMisses,
  };
}

function buildDeliverableIntegrity(
  result: OrchestrationResult,
): WorkflowInspectorDeliverableIntegrity {
  const validation = validateDeliverableFields(result.deliverable);
  const workerOutput = result.executions
    .map((exec) => exec.worker?.result.outputText.trim() ?? "")
    .find(Boolean);

  return {
    deliverableExists: deliverableHasContent(result.deliverable),
    type: result.deliverable.type ?? null,
    titleExists: Boolean(result.deliverable.title?.trim()),
    markdownExists: Boolean(result.deliverable.markdown?.trim()),
    plainTextExists: Boolean(result.deliverable.plainText?.trim()),
    metadataExists: Boolean(result.deliverable.metadata),
    downloadsReady: (result.deliverable.downloads?.length ?? 0) > 0,
    validationValid: validation.valid,
    validationIssues: validation.missingFields,
    workerRawOutputExists: Boolean(workerOutput),
    parsedDeliverableType: result.deliverable.type ?? null,
    emailSubjectDetected:
      result.deliverable.type === "email"
        ? detectEmailSubject(result.deliverable) || null
        : null,
  };
}

function buildFailureDiagnostics(
  result: OrchestrationResult,
): WorkflowInspectorFailureDiagnostics | null {
  const needsReviewReason = result.isolationDebug?.pipeline?.needsReviewReason ?? null;
  const hasFailureSignal =
    result.status === "failed" ||
    Boolean(result.stepError) ||
    Boolean(result.error) ||
    Boolean(needsReviewReason);

  if (!hasFailureSignal) {
    return null;
  }

  const failedStage =
    result.isolationDebug?.pipeline?.failedStage ??
    result.pipelineDebug?.failureStage ??
    result.stepError?.step ??
    result.workflow.failureReason ??
    null;

  const reason =
    needsReviewReason ??
    result.workflow.failureReason ??
    result.error ??
    result.stepError?.message ??
    null;

  const verbose = isAtlasDebugVerboseEnabled();

  return {
    failedStage: failedStage ? String(failedStage) : null,
    reason,
    rawError: verbose ? (result.error ?? result.stepError?.message ?? null) : null,
    recommendedFix: result.stepError?.timedOut
      ? "Retry the request with a shorter assignment or check service availability."
      : "Review the assignment and retry. If the issue persists, contact support with the step error.",
    timedOut: Boolean(result.stepError?.timedOut ?? result.workflow.timedOut),
  };
}

function buildIsolationDiagnostics(
  result: OrchestrationResult,
): WorkflowInspectorIsolationDiagnostics | null {
  const debug = result.isolationDebug;
  if (!debug) return null;

  return {
    cacheKey: debug.cacheKey,
    assignmentHash: debug.assignmentHash,
    deliverableType: debug.deliverableType,
    workflowVersion: debug.workflowVersion,
    policyVersion: debug.policyVersion,
    cacheReplay: debug.cacheReplay,
    knowledgeRetrieved: debug.knowledge.retrievedCount,
    knowledgeFiltered: debug.knowledge.filteredCount,
    knowledgeDiscarded: debug.knowledge.discardedCount,
    knowledgeDecisions: debug.knowledge.decisions.map((d) => ({
      title: d.title,
      category: d.category,
      entryType: d.entryType,
      relevanceScore: d.relevanceScore,
      included: d.included,
      target: d.target,
      reason: d.reason,
    })),
    pipeline: debug.pipeline ?? null,
  };
}

/** Build a developer-only workflow inspector report from an orchestration result. */
export function buildWorkflowInspectorReport(
  result: OrchestrationResult,
): WorkflowInspectorReport {
  return {
    summary: {
      workflowId: result.workflow.workflowId,
      legacyStatus: result.status,
      finalState: result.workflow.state,
      startedAt: inferStartedAt(result),
      completedAt: result.workflow.updatedAt ?? null,
      totalDurationMs: result.totalDurationMs,
      deliverableType: result.deliverable.type ?? null,
      deliverableTitle: result.deliverable.title?.trim() || null,
    },
    stages: [...buildOrchestrationStages(result), ...buildDerivedStages(result)],
    aiCalls: buildAiCalls(result.costDebug),
    cost: buildCostSummary(result.costDebug),
    deliverableIntegrity: buildDeliverableIntegrity(result),
    failure: buildFailureDiagnostics(result),
    isolation: buildIsolationDiagnostics(result),
  };
}

export function formatInspectorDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms === 0) return "<1ms";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatInspectorCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

export function formatContentSignal(signal: WorkflowInspectorContentSignal): string {
  return signal.exists ? `yes (${signal.length.toLocaleString()} chars)` : "no";
}

export function inspectorStageStatusLabel(status: WorkflowInspectorStageStatus): string {
  switch (status) {
    case "completed":
      return "OK";
    case "warning":
      return "WARN";
    case "failed":
      return "FAIL";
    case "skipped":
      return "SKIP";
    default:
      return "—";
  }
}

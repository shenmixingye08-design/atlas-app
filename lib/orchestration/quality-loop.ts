import "server-only";

import type { AgentContext } from "@/lib/agents/types";
import type { AgentId } from "@/lib/agents/types";
import { buildReviewerTaskPrompt } from "@/lib/agents/tasks";
import {
  buildCompactUnifiedWorkerRevisionPrompt,
} from "@/lib/prompts/workflow/compact-prompts";
import { resolveWorkerPolicy } from "@/lib/ai/policy-engine";
import type { EmployeeId } from "@/lib/employees/types";
import type { AiTaskType } from "@/lib/ai/model-policy";
import type { WorkflowCostMeter } from "@/lib/ai/cost-meter";
import { WORKFLOW_LIMITS, WorkflowLimitError } from "@/lib/ai/workflow-limits";
import type { KnowledgeRetrievalResult } from "@/lib/knowledge/types";
import {
  rebuildDeliverableFromWorkerPhase,
  resolveQualityEngineTier,
  runQualityEngine,
} from "@/lib/quality-engine";

import { buildDeterministicCeoApproval } from "./ceo-routing";
import { runDeterministicQa } from "./deterministic-qa";
import { runDeterministicTaskReview } from "./deterministic-reviewer";
import { buildSlimWorkerContext } from "./slim-context";
import { buildFinalResponseSummary, buildDeliverable } from "./deliverable-builder";
import { deliverableHasContent } from "./deliverable-types";
import type { Deliverable } from "./deliverable-types";
import {
  ensureDeliverable,
  validateDeliverableFields,
} from "./deliverable-validation";
import { createPipelineFailure } from "./errors";
import type {
  AgentPhaseResult,
  CeoApprovalRecord,
  OrchestrationStep,
  QualityLoopResult,
  QualityReviewRecord,
  ResearchStageResult,
  TaskExecutionResult,
  WorkTask,
} from "./types";
import { assertWorkersProducedDeliverables } from "./worker-validation";
import type { WorkerAssignment } from "./worker-assignment";
import type { WorkflowStateManager } from "./workflow-state";
import { WorkflowState } from "./workflow-state";

type RunPhaseFn = (
  step: OrchestrationStep,
  agentId: AgentId,
  task: string,
  context: AgentContext,
  metadata?: Readonly<Record<string, unknown>>,
  employeeId?: EmployeeId,
  aiTaskType?: AiTaskType,
) => Promise<AgentPhaseResult>;

export type QualityLoopParams = {
  assignment: string;
  research?: ResearchStageResult;
  plannerPlan: AgentPhaseResult;
  plannerTasks: AgentPhaseResult;
  tasks: WorkTask[];
  executions: TaskExecutionResult[];
  workerAssignments: WorkerAssignment[];
  deliverableType: string;
  researchSummary?: string | null;
  planSummary: string;
  metadata?: Readonly<Record<string, unknown>>;
  knowledge?: KnowledgeRetrievalResult | null;
  /** Optional prior stage timings for owner Quality Engine logs. */
  priorStageTimings?: {
    plannerMs?: number;
    writerMs?: number;
  };
  runPhase: RunPhaseFn;
  trackStep: (step: OrchestrationStep, taskId?: number) => void;
  costMeter: WorkflowCostMeter;
  workflowState?: WorkflowStateManager;
};

export type QualityLoopOutput = {
  executions: TaskExecutionResult[];
  deliverable: Deliverable;
  reviewComments: string;
  qualityLoop: QualityLoopResult;
  finalResponse: string;
  approved: boolean;
  deliverableRecovered: boolean;
  deliverableValidation: ReturnType<typeof validateDeliverableFields>;
  deliverableBuilderInputSource: import("./pipeline-execution").DeliverableBuilderInputSource;
};

function buildReviewComments(executions: TaskExecutionResult[]): string {
  return executions
    .filter((exec) => exec.reviewerStatus === "completed" && exec.reviewer)
    .sort((a, b) => a.task.id - b.task.id)
    .map(
      (exec) =>
        `## Task ${exec.task.id} — Review\n\n${exec.reviewer!.result.outputText.trim()}`,
    )
    .join("\n\n---\n\n");
}

async function runReviewerFallbackIfNeeded(
  deliverable: Deliverable,
  tasks: WorkTask[],
  params: QualityLoopParams,
): Promise<void> {
  const primaryTask = tasks[0];
  if (!primaryTask) return;

  const review = runDeterministicTaskReview(deliverable, primaryTask);
  if (!review.needsLlmFallback) return;

  if (params.costMeter.getCallCount() >= WORKFLOW_LIMITS.maxLlmCalls) {
    return;
  }

  params.trackStep("reviewer", primaryTask.id);
  params.costMeter.assertWithinLimits();

  await params.runPhase(
    "reviewer",
    "reviewer",
    buildReviewerTaskPrompt(primaryTask),
    {
      assignment: params.assignment.slice(0, 2000),
      priorOutputs: [
        {
          agentId: "worker",
          role: "worker",
          output: deliverable.markdown.slice(0, 3000),
        },
      ],
    },
    params.metadata,
    undefined,
    "reviewer_fallback",
  );
}

async function executeUnifiedWorkerRevision(
  params: QualityLoopParams,
  feedback: string,
  primaryEmployeeId: EmployeeId,
): Promise<AgentPhaseResult> {
  params.trackStep("worker", 1);
  params.costMeter.assertWithinLimits();

  return params.runPhase(
    "worker",
    "worker",
    buildCompactUnifiedWorkerRevisionPrompt(feedback, params.deliverableType),
    buildSlimWorkerContext({
      assignment: params.assignment,
      deliverableType: params.deliverableType as Deliverable["type"],
      planSummary: params.planSummary,
      researchSummary: params.researchSummary,
      qualityRequirements: feedback,
    }),
    params.metadata,
    primaryEmployeeId,
    resolveWorkerPolicy({ deliverableType: params.deliverableType, revision: true })
      .taskType,
  );
}

/**
 * Quality loop: structural deterministic QA + Quality Engine (Reviewer/Judge/improve/Formatter)
 * + rules CEO approval.
 */
export async function runQualityLoop(
  params: QualityLoopParams,
): Promise<QualityLoopOutput> {
  let executions = [...params.executions];
  let revisionCount = 0;
  const reviews: QualityReviewRecord[] = [];

  params.workflowState?.transition(WorkflowState.QA, "quality loop");

  let workflowDeliverable = buildDeliverable({
    assignment: params.assignment,
    executions,
    research: params.research,
    plannerPlan: params.plannerPlan,
    expectedType: params.deliverableType as Deliverable["type"],
  });

  let deterministicQa = runDeterministicQa(workflowDeliverable);
  let latestFeedback = deterministicQa.feedback;

  reviews.push({
    attempt: 1,
    revisionNumber: 0,
    score: deterministicQa.overallScore,
    criteria: deterministicQa.criteria,
    passed: deterministicQa.passed,
    feedback: deterministicQa.feedback,
    tasksRevised: [],
    qa: null,
    qaStatus: "completed",
  });

  const primaryEmployeeId =
    params.workerAssignments[0]?.employeeId ?? "development-senior-dev";

  // Structural repair before Quality Engine (keeps empty/broken bodies from reaching Judge).
  if (!deterministicQa.passed && revisionCount < WORKFLOW_LIMITS.maxWorkerRetries) {
    try {
      params.costMeter.assertWithinLimits();
      params.workflowState?.transition(WorkflowState.Generating, "worker revision");

      const workerPhase = await executeUnifiedWorkerRevision(
        params,
        deterministicQa.feedback,
        primaryEmployeeId,
      );

      executions = params.tasks.map((task, index) => ({
        task,
        assignedEmployeeId:
          params.workerAssignments[index]?.employeeId ?? primaryEmployeeId,
        worker: workerPhase,
        workerStatus: "completed" as const,
        reviewer: executions[index]?.reviewer ?? null,
        reviewerStatus: executions[index]?.reviewerStatus ?? ("skipped" as const),
        approved: executions[index]?.approved ?? false,
      }));

      assertWorkersProducedDeliverables(
        executions.filter((e) => e.worker),
        params.assignment,
        params.deliverableType as Deliverable["type"],
      );

      revisionCount = 1;
      workflowDeliverable = buildDeliverable({
        assignment: params.assignment,
        executions,
        research: params.research,
        plannerPlan: params.plannerPlan,
        expectedType: params.deliverableType as Deliverable["type"],
      });

      deterministicQa = runDeterministicQa(workflowDeliverable);
      latestFeedback = deterministicQa.feedback;
      params.workflowState?.transition(WorkflowState.QA, "qa re-run after revision");

      reviews.push({
        attempt: 2,
        revisionNumber: 1,
        score: deterministicQa.overallScore,
        criteria: deterministicQa.criteria,
        passed: deterministicQa.passed,
        feedback: deterministicQa.feedback,
        tasksRevised: params.tasks.map((t) => t.id),
        qa: null,
        qaStatus: "completed",
      });
    } catch (error) {
      if (error instanceof WorkflowLimitError) {
        latestFeedback = `${deterministicQa.feedback}\n\n${error.message} — 要確認`;
      } else {
        throw error;
      }
    }
  }

  const engineTier = resolveQualityEngineTier({
    deliverableType: params.deliverableType,
    metadata: params.metadata,
    assignment: params.assignment,
  });

  // Legacy fallback only on fast tier — enhanced/full use Quality Engine Reviewer.
  if (engineTier === "fast") {
    await runReviewerFallbackIfNeeded(workflowDeliverable, params.tasks, params);
  }

  // --- Quality Engine (Reviewer / Judge / improve / Formatter) ---
  let engineTelemetry: import("@/lib/quality-engine").QualityEngineTelemetry | undefined;
  try {
    const engine = await runQualityEngine({
      assignment: params.assignment,
      deliverable: workflowDeliverable,
      deliverableType: params.deliverableType,
      tasks: params.tasks,
      planSummary: params.planSummary,
      researchSummary: params.researchSummary,
      research: params.research,
      plannerPlan: params.plannerPlan,
      metadata: params.metadata,
      knowledge: params.knowledge,
      primaryEmployeeId,
      runPhase: params.runPhase,
      trackStep: params.trackStep,
      costMeter: params.costMeter,
      priorTimings: {
        plannerMs: params.priorStageTimings?.plannerMs ?? 0,
        writerMs: params.priorStageTimings?.writerMs ?? 0,
      },
      rebuildDeliverable: (workerPhase) =>
        rebuildDeliverableFromWorkerPhase({
          assignment: params.assignment,
          workerPhase,
          tasks: params.tasks,
          research: params.research,
          plannerPlan: params.plannerPlan,
          deliverableType: params.deliverableType,
          primaryEmployeeId,
        }),
    });

    workflowDeliverable = engine.deliverable;
    revisionCount += engine.improveCount;
    engineTelemetry = engine.telemetry;

    reviews.push({
      attempt: reviews.length + 1,
      revisionNumber: revisionCount,
      score: engine.judge.overallScore,
      criteria: engine.judge.legacyCriteria,
      passed: engine.judge.passed,
      feedback: [
        engine.judge.feedback,
        engine.reviewer && !engine.reviewer.approved
          ? engine.reviewer.feedback
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      tasksRevised: engine.improveCount > 0 ? params.tasks.map((t) => t.id) : [],
      qa: null,
      qaStatus: "completed",
    });

    // Surface Judge score for telemetry/history; structural QA still gates approval
    // so a sub-90 score after max improves does not block delivery.
    deterministicQa = {
      overallScore: engine.judge.overallScore,
      criteria: engine.judge.legacyCriteria,
      passed: deterministicQa.passed,
      feedback: [deterministicQa.feedback, engine.judge.feedback]
        .filter(Boolean)
        .join("\n\n"),
      failedChecks: deterministicQa.failedChecks,
    };
    latestFeedback = deterministicQa.feedback;
  } catch {
    // Engine must not break the pipeline — keep structural QA result.
  }

  const ensured = ensureDeliverable({
    assignment: params.assignment,
    executions,
    research: params.research,
    plannerPlan: params.plannerPlan,
    deliverable: workflowDeliverable,
  });
  workflowDeliverable = ensured.deliverable;

  const fromWorkerCache = executions.some(
    (exec) => exec.worker?.result.model === "cache",
  );
  const deliverableBuilderInputSource: import("./pipeline-execution").DeliverableBuilderInputSource =
    ensured.recovered
      ? "recovery"
      : fromWorkerCache
        ? "cache"
        : deliverableHasContent(workflowDeliverable)
          ? "worker"
          : "none";

  if (!deliverableHasContent(workflowDeliverable)) {
    throw createPipelineFailure(
      "final_deliverable",
      "reviewer",
      "Deliverable Builder produced empty output and recovery failed.",
      "Retry the request. Verify the worker returns structured JSON with title, summary, content, and markdown.",
    );
  }

  const deliverableValidation = ensured.validation;
  if (!deliverableValidation.valid) {
    deterministicQa = runDeterministicQa(workflowDeliverable);
    latestFeedback = [
      deterministicQa.feedback,
      `Missing deliverable fields: ${deliverableValidation.missingFields.join(", ")}`,
    ].join("\n");
  }

  params.trackStep("ceo_approval");
  params.workflowState?.transitionForStep("ceo_approval");
  const ceoApprovalResult = buildDeterministicCeoApproval(
    params.assignment,
    deterministicQa.overallScore,
    deterministicQa.passed && deliverableValidation.valid,
  );

  const ceoApproval: CeoApprovalRecord = {
    approved:
      ceoApprovalResult.approved &&
      deterministicQa.passed &&
      deliverableValidation.valid,
    ceo: ceoApprovalResult.phase,
    status: "completed",
    comments: deliverableValidation.valid
      ? ceoApprovalResult.comments
      : `${ceoApprovalResult.comments}\n\n要確認 — required deliverable fields missing: ${deliverableValidation.missingFields.join(", ")}`,
  };

  const reviewComments = buildReviewComments(executions);
  const taskReviewsApproved = executions.every((exec) => exec.approved !== false);

  const pipelineApproved =
    deterministicQa.passed &&
    taskReviewsApproved &&
    ceoApproval.approved &&
    deliverableValidation.valid;

  const finalResponse = buildFinalResponseSummary(workflowDeliverable);
  const approved =
    pipelineApproved && deliverableHasContent(workflowDeliverable);

  if (deliverableHasContent(workflowDeliverable)) {
    params.workflowState?.transition(
      WorkflowState.DeliverableReady,
      "deliverable validated after approval",
    );
  }

  const qualityLoop: QualityLoopResult = {
    reviews,
    revisionCount,
    currentScore: deterministicQa.overallScore,
    passed: deterministicQa.passed && deliverableValidation.valid,
    ceoApproval,
    ...(engineTelemetry ? { qualityEngine: engineTelemetry } : {}),
  };

  void latestFeedback;

  return {
    executions,
    deliverable: workflowDeliverable,
    reviewComments,
    qualityLoop,
    finalResponse,
    approved,
    deliverableRecovered: ensured.recovered,
    deliverableValidation,
    deliverableBuilderInputSource,
  };
}

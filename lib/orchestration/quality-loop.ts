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

import {
  evaluateDeliverableQuality,
  mergeQualityIntoDeterministicFeedback,
} from "@/lib/deliverable-quality";

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

  const memoryKnowledge =
    typeof params.metadata?.hierarchicalMemory === "string"
      ? params.metadata.hierarchicalMemory
      : null;

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
      workerKnowledge: memoryKnowledge,
    }),
    params.metadata,
    primaryEmployeeId,
    resolveWorkerPolicy({ deliverableType: params.deliverableType, revision: true }).taskType,
  );
}

/**
 * Optimized quality loop: deterministic QA + optional worker-only retry + rules CEO approval.
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
  let enhanced = evaluateDeliverableQuality({
    deliverable: workflowDeliverable,
    assignment: params.assignment,
    baseScore: deterministicQa.overallScore,
    baseFailedChecks: deterministicQa.failedChecks,
  });
  let latestFeedback = mergeQualityIntoDeterministicFeedback(
    enhanced,
    deterministicQa.feedback,
  );
  let qaPassed = deterministicQa.passed && enhanced.passed;

  reviews.push({
    attempt: 1,
    revisionNumber: 0,
    score: enhanced.overallScore,
    criteria: deterministicQa.criteria,
    passed: qaPassed,
    feedback: latestFeedback,
    tasksRevised: [],
    qa: null,
    qaStatus: "completed",
  });

  while (!qaPassed && revisionCount < WORKFLOW_LIMITS.maxWorkerRetries) {
    try {
      params.costMeter.assertWithinLimits();
      params.workflowState?.transition(WorkflowState.Generating, "worker revision");
      const primaryEmployeeId =
        params.workerAssignments[0]?.employeeId ?? "development-senior-dev";

      const workerPhase = await executeUnifiedWorkerRevision(
        params,
        latestFeedback,
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

      revisionCount += 1;
      workflowDeliverable = buildDeliverable({
        assignment: params.assignment,
        executions,
        research: params.research,
        plannerPlan: params.plannerPlan,
        expectedType: params.deliverableType as Deliverable["type"],
      });

      deterministicQa = runDeterministicQa(workflowDeliverable);
      enhanced = evaluateDeliverableQuality({
        deliverable: workflowDeliverable,
        assignment: params.assignment,
        baseScore: deterministicQa.overallScore,
        baseFailedChecks: deterministicQa.failedChecks,
      });
      latestFeedback = mergeQualityIntoDeterministicFeedback(
        enhanced,
        deterministicQa.feedback,
      );
      qaPassed = deterministicQa.passed && enhanced.passed;
      params.workflowState?.transition(WorkflowState.QA, "qa re-run after revision");

      reviews.push({
        attempt: revisionCount + 1,
        revisionNumber: revisionCount,
        score: enhanced.overallScore,
        criteria: deterministicQa.criteria,
        passed: qaPassed,
        feedback: latestFeedback,
        tasksRevised: params.tasks.map((t) => t.id),
        qa: null,
        qaStatus: "completed",
      });
    } catch (error) {
      if (error instanceof WorkflowLimitError) {
        latestFeedback = `${latestFeedback}\n\n${error.message} — 要確認`;
        break;
      }
      throw error;
    }
  }

  await runReviewerFallbackIfNeeded(workflowDeliverable, params.tasks, params);

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
  // Re-evaluate after ensure/validation path may have changed content
  enhanced = evaluateDeliverableQuality({
    deliverable: workflowDeliverable,
    assignment: params.assignment,
    baseScore: deterministicQa.overallScore,
    baseFailedChecks: [
      ...deterministicQa.failedChecks,
      ...(!deliverableValidation.valid
        ? deliverableValidation.missingFields.map((f) => `missing:${f}`)
        : []),
    ],
  });
  qaPassed = deterministicQa.passed && enhanced.passed && deliverableValidation.valid;

  const ceoApprovalResult = buildDeterministicCeoApproval(
    params.assignment,
    enhanced.overallScore,
    qaPassed,
  );

  const hitRevisionCap = !qaPassed && revisionCount >= WORKFLOW_LIMITS.maxWorkerRetries;
  const deliveryStatus =
    enhanced.deliveryStatus === "failed"
      ? "failed"
      : hitRevisionCap || enhanced.majorErrors.length > 0 || !qaPassed
        ? "needs_review"
        : "completed";

  const ceoApproval: CeoApprovalRecord = {
    approved: ceoApprovalResult.approved && qaPassed && deliveryStatus === "completed",
    ceo: ceoApprovalResult.phase,
    status: "completed",
    comments: [
      ceoApprovalResult.comments,
      !deliverableValidation.valid
        ? `要確認 — required deliverable fields missing: ${deliverableValidation.missingFields.join(", ")}`
        : null,
      hitRevisionCap ? "自動修正上限に達したため要確認です。" : null,
      enhanced.majorErrors.length > 0
        ? `重大エラー: ${enhanced.majorErrors.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };

  const reviewComments = buildReviewComments(executions);
  const taskReviewsApproved = executions.every((exec) => exec.approved !== false);

  const pipelineApproved =
    qaPassed &&
    taskReviewsApproved &&
    ceoApproval.approved &&
    deliverableValidation.valid &&
    deliveryStatus === "completed";

  const finalResponse = buildFinalResponseSummary(workflowDeliverable);
  const approved =
    pipelineApproved && deliverableHasContent(workflowDeliverable);

  if (deliverableHasContent(workflowDeliverable)) {
    params.workflowState?.transition(
      WorkflowState.DeliverableReady,
      deliveryStatus === "completed"
        ? "deliverable validated after approval"
        : "deliverable ready for user review",
    );
  }

  const qualityLoop: QualityLoopResult = {
    reviews,
    revisionCount,
    currentScore: enhanced.overallScore,
    passed: qaPassed,
    ceoApproval,
    deliveryStatus,
    majorErrors: enhanced.majorErrors,
    enhancedScore: enhanced.overallScore,
  };

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

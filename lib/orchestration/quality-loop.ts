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
  existingWorker: AgentPhaseResult | null,
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

  if (!deterministicQa.passed && revisionCount < WORKFLOW_LIMITS.maxWorkerRetries) {
    try {
      params.costMeter.assertWithinLimits();
      params.workflowState?.transition(WorkflowState.Generating, "worker revision");
      const primaryEmployeeId =
        params.workerAssignments[0]?.employeeId ?? "development-senior-dev";

      const workerPhase = await executeUnifiedWorkerRevision(
        params,
        deterministicQa.feedback,
        primaryEmployeeId,
        executions[0]?.worker ?? null,
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

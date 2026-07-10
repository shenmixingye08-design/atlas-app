import "server-only";

import type { AgentContext } from "@/lib/agents/types";
import type { AgentId } from "@/lib/agents/types";
import type { AiTaskType } from "@/lib/ai/model-policy";
import { buildCompactPlannerTaskPrompt } from "@/lib/prompts/workflow/compact-prompts";
import { buildCompactUnifiedWorkerTaskPrompt } from "@/lib/prompts/workflow/compact-prompts";
import { resolvePlannerPolicy, resolveWorkerPolicy } from "@/lib/ai/policy-engine";
import { readSalesCostMode } from "@/lib/workspace/sales-material/metadata";
import { assignmentWithinLimit } from "@/lib/ai/token-limits";
import {
  createWorkflowCostMeter,
  logCostSummary,
  type WorkflowCostMeter,
} from "@/lib/ai/cost-meter";
import { WorkflowLimitError } from "@/lib/ai/workflow-limits";

import { buildDeterministicCeoPhase } from "./ceo-routing";
import { buildExecutionsWithDeterministicReviews } from "./deterministic-reviewer";
import { buildDeliverable, buildFinalResponseSummary } from "./deliverable-builder";
import { deliverableHasContent, emptyDeliverable } from "./deliverable-types";
import {
  canRenderCoreFinalOutput,
  classifyCoreDeliverableType,
  coreStageFailureMessage,
  validateCoreDeliverable,
  type CoreStage,
} from "./core-workflow";
import { createPipelineFailure, formatStepErrorMessage, pipelineFailureFromError, toStepError } from "./errors";
import { parseUnifiedPlannerOutput } from "./parse-unified-planner";
import { parseTasksFromPlannerOutput } from "./parse-tasks";
import {
  createInitialPipelineExecutionDebug,
} from "./pipeline-execution";
import { runWorkflowEmployee, resolveWorkflowInstructions } from "./run-employee";
import { buildSlimPlannerContext, buildSlimWorkerContext } from "./slim-context";
import { OrchestrationTimeoutError, withStepTimeout } from "./timeout";
import { assignWorkersToTasks } from "./worker-assignment";
import {
  assertWorkerStageExecuted,
  assertWorkersProducedDeliverables,
} from "./worker-validation";
import {
  legacyOrchestrationStatus,
  WorkflowState,
  WorkflowStateManager,
} from "./workflow-state";
import type {
  AgentPhaseResult,
  OrchestrationRequest,
  OrchestrationResult,
  OrchestrationStep,
  TaskExecutionResult,
  WorkTask,
  WorkflowIsolationDebug,
} from "./types";

const CORE_STAGES: CoreStage[] = ["ceo", "planner_plan", "worker", "final_deliverable"];

type CoreStageFlags = Record<CoreStage, boolean>;

function createStageFlags(): CoreStageFlags {
  return {
    ceo: false,
    planner_plan: false,
    worker: false,
    final_deliverable: false,
  };
}

function assertCoreStage(stage: CoreStage, flags: CoreStageFlags): void {
  if (!flags[stage]) {
    throw createPipelineFailure(
      stage,
      stage === "planner_plan" ? "planner" : stage === "final_deliverable" ? "reviewer" : stage,
      coreStageFailureMessage(stage),
      "依頼内容を確認して再実行してください。",
    );
  }
}

async function runPhase(
  step: OrchestrationStep,
  agentId: AgentId,
  task: string,
  context: AgentContext,
  costMeter: WorkflowCostMeter,
  metadata?: Readonly<Record<string, unknown>>,
  aiTaskType?: AiTaskType,
): Promise<AgentPhaseResult> {
  costMeter.assertWithinLimits();
  const start = Date.now();

  const result = await withStepTimeout(
    runWorkflowEmployee(agentId, undefined, {
      task,
      context: { ...context, metadata: context.metadata ?? metadata },
      aiTaskType,
    }),
    step,
  );

  const instructions = resolveWorkflowInstructions(agentId, undefined, aiTaskType);
  costMeter.recordLlmCall({
    department: step === "planner_plan" ? "planning" : "production",
    taskType: aiTaskType ?? "planner_unified",
    inputText: task + JSON.stringify(context),
    outputText: result.outputText,
    instructions,
  });
  costMeter.assertWithinLimits();

  return { result, durationMs: Date.now() - start };
}

function buildSyntheticPlannerTasksPhase(tasks: WorkTask[]): AgentPhaseResult {
  const outputText = tasks
    .map((t) => `Task ${t.id}: ${t.title} — ${t.description}`)
    .join("\n");

  return {
    result: {
      agentId: "planner",
      role: "planner",
      name: "Lead Planner",
      outputText,
      responseId: `planner-tasks-synthetic-${crypto.randomUUID()}`,
      status: "completed",
      model: "atlas-rules",
    },
    durationMs: 0,
  };
}

/**
 * Minimal core pipeline (ATLAS_CORE_TEST=true):
 * CEO → Planner → Worker → Deliverable Builder → FinalOutput
 */
export async function orchestrateCore(
  request: OrchestrationRequest,
): Promise<OrchestrationResult> {
  const pipelineStart = Date.now();
  const assignment = request.assignment.trim();
  if (!assignmentWithinLimit(assignment)) {
    throw new WorkflowLimitError(
      "依頼内容が長すぎます。8,000文字以内に分割して再試行してください。",
    );
  }

  const metadata = request.metadata;
  const costMeter = createWorkflowCostMeter();
  const deliverableType = classifyCoreDeliverableType(assignment);
  const stageFlags = createStageFlags();

  let ceo: AgentPhaseResult | null = null;
  let plannerPlan: AgentPhaseResult | null = null;
  let plannerTasks: AgentPhaseResult | null = null;
  let tasks: WorkTask[] = [];
  let executions: TaskExecutionResult[] = [];
  let currentStep: OrchestrationStep = "ceo";
  let workflowStateManager: WorkflowStateManager | null = null;

  const isolationDebug: WorkflowIsolationDebug = {
    cacheKey: "core-disabled",
    assignmentHash: "core",
    deliverableType,
    workflowVersion: "core",
    policyVersion: "core",
    cacheReplay: { planner: false, worker: false, research: false },
    knowledge: {
      retrievedCount: 0,
      filteredCount: 0,
      discardedCount: 0,
      deliverableType,
      decisions: [],
    },
    pipeline: createInitialPipelineExecutionDebug(),
  };

  const trackStep = (step: OrchestrationStep) => {
    currentStep = step;
    workflowStateManager?.transitionForStep(step);
  };

  try {
    const workflowId = crypto.randomUUID();
    workflowStateManager = new WorkflowStateManager(workflowId);

    trackStep("ceo");
    ceo = buildDeterministicCeoPhase(assignment, null, deliverableType);
    stageFlags.ceo = true;
    isolationDebug.pipeline.plannerExecuted = false;

    trackStep("planner_plan");
    const plannerPolicy = resolvePlannerPolicy({ assignment, deliverableType });
    plannerPlan = await runPhase(
      "planner_plan",
      "planner",
      buildCompactPlannerTaskPrompt(assignment, deliverableType),
      buildSlimPlannerContext(assignment, null, deliverableType, null),
      costMeter,
      metadata,
      plannerPolicy.taskType,
    );
    stageFlags.planner_plan = true;
    isolationDebug.pipeline.plannerExecuted = true;

    const parsed = parseUnifiedPlannerOutput(
      plannerPlan.result.outputText,
      assignment,
      parseTasksFromPlannerOutput,
    );
    tasks = parsed.tasks;
    plannerTasks = buildSyntheticPlannerTasksPhase(tasks);
    const planSummary = parsed.plan;
    const workerAssignments = assignWorkersToTasks(tasks);

    trackStep("worker");
    const workerPolicy = resolveWorkerPolicy({
      deliverableType,
      costSavingMode: readSalesCostMode(metadata),
    });
    const workerPhase = await runPhase(
      "worker",
      "worker",
      buildCompactUnifiedWorkerTaskPrompt(tasks, deliverableType),
      buildSlimWorkerContext({
        assignment,
        deliverableType,
        planSummary,
        researchSummary: null,
        workerKnowledge: null,
      }),
      costMeter,
      metadata,
      workerPolicy.taskType,
    );
    stageFlags.worker = true;
    isolationDebug.pipeline.workerExecuted = true;
    isolationDebug.pipeline.workerOutputExists = Boolean(workerPhase.result.outputText.trim());
    isolationDebug.pipeline.deliverableBuilderInputSource = "worker";

    assertWorkerStageExecuted(true);
    assertWorkersProducedDeliverables(
      [
        {
          task: tasks[0] ?? { id: 1, title: "Deliverable", description: assignment },
          assignedEmployeeId: workerAssignments[0]?.employeeId ?? "development-senior-dev",
          worker: workerPhase,
          workerStatus: "completed",
          reviewer: null,
          reviewerStatus: "skipped",
          approved: false,
        },
      ],
      assignment,
      deliverableType,
    );

    trackStep("final_deliverable");
    stageFlags.final_deliverable = true;

    const primaryExecution: TaskExecutionResult = {
      task: tasks[0] ?? { id: 1, title: "Deliverable", description: assignment },
      assignedEmployeeId: workerAssignments[0]?.employeeId ?? "development-senior-dev",
      worker: workerPhase,
      workerStatus: "completed",
      reviewer: null,
      reviewerStatus: "skipped",
      approved: false,
    };

    const provisionalDeliverable = buildDeliverable({
      assignment,
      executions: [primaryExecution],
      expectedType: deliverableType,
    });

    executions = buildExecutionsWithDeterministicReviews(
      tasks,
      workerPhase,
      workerAssignments,
      provisionalDeliverable,
    );

    const deliverable = buildDeliverable({
      assignment,
      executions,
      expectedType: deliverableType,
    });

    const coreValidation = validateCoreDeliverable(deliverable);
    if (!coreValidation.valid) {
      throw createPipelineFailure(
        "final_deliverable",
        "reviewer",
        `Deliverable Builder — missing: ${coreValidation.missing.join(", ")}`,
        "Worker output must include all required fields for the deliverable type.",
      );
    }

    if (!canRenderCoreFinalOutput(deliverable)) {
      throw createPipelineFailure(
        "final_deliverable",
        "reviewer",
        "FinalOutput cannot render this deliverable.",
        "Verify worker returns complete structured output.",
      );
    }

    for (const stage of CORE_STAGES) {
      assertCoreStage(stage, stageFlags);
    }

    const approved = deliverableHasContent(deliverable) && coreValidation.renderable;
    workflowStateManager.transition(WorkflowState.QA, "core deliverable built");
    workflowStateManager.transition(WorkflowState.Approved, "core approved");
    workflowStateManager.transition(WorkflowState.DeliverableReady, "core deliverable ready");
    workflowStateManager.finalize({ hasDeliverable: true, approved });

    isolationDebug.pipeline.needsReviewReason = null;
    logCostSummary(costMeter.getSummary());

    return {
      assignment,
      status: legacyOrchestrationStatus(workflowStateManager.getState()),
      workflow: workflowStateManager.getSnapshot(),
      ceo,
      plannerPlan,
      plannerTasks,
      tasks,
      executions,
      deliverable,
      reviewComments: "",
      approved,
      finalResponse: buildFinalResponseSummary(deliverable),
      totalDurationMs: Date.now() - pipelineStart,
      isolationDebug,
    };
  } catch (error) {
    logCostSummary(costMeter.getSummary());

    if (!workflowStateManager) {
      workflowStateManager = new WorkflowStateManager(crypto.randomUUID());
    }

    const failedStep =
      error instanceof OrchestrationTimeoutError ? error.step : currentStep;

    for (const stage of CORE_STAGES) {
      if (stage === failedStep || stage === currentStep) break;
      if (!stageFlags[stage]) {
        isolationDebug.pipeline.failedStage = stage;
        isolationDebug.pipeline.needsReviewReason = coreStageFailureMessage(stage);
        break;
      }
    }

    if (!isolationDebug.pipeline.failedStage) {
      isolationDebug.pipeline.failedStage = failedStep;
    }
    isolationDebug.pipeline.needsReviewReason =
      error instanceof Error ? error.message : coreStageFailureMessage(failedStep as CoreStage);

    workflowStateManager.fail(
      error instanceof Error ? error.message : "Core workflow failed",
      { timedOut: error instanceof OrchestrationTimeoutError },
    );

    const stepError = toStepError(error, failedStep, "worker");
    const failureInfo = pipelineFailureFromError(error, failedStep, "worker");

    return {
      assignment,
      status: legacyOrchestrationStatus(workflowStateManager.getState()),
      workflow: workflowStateManager.getSnapshot(),
      ceo,
      plannerPlan,
      plannerTasks,
      tasks,
      executions,
      deliverable: deliverableHasContent(
        buildDeliverable({ assignment, executions, expectedType: deliverableType }),
      )
        ? buildDeliverable({ assignment, executions, expectedType: deliverableType })
        : emptyDeliverable(deliverableType),
      reviewComments: "",
      approved: false,
      finalResponse: failureInfo
        ? `${failureInfo.reason}\n\nRecommended action: ${failureInfo.recommendedAction}`
        : formatStepErrorMessage(stepError),
      totalDurationMs: Date.now() - pipelineStart,
      error: failureInfo
        ? `[${failureInfo.department}] ${failureInfo.reason}`
        : formatStepErrorMessage(stepError),
      stepError,
      isolationDebug,
    };
  }
}

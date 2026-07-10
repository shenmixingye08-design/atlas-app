import "server-only";

import type { AgentContext } from "@/lib/agents/types";
import type { AgentId } from "@/lib/agents/types";
import type { AiTaskType } from "@/lib/ai/model-policy";
import { buildCompactUnifiedWorkerTaskPrompt } from "@/lib/prompts/workflow/compact-prompts";
import { buildCompactPlannerTaskPrompt } from "@/lib/prompts/workflow/compact-prompts";
import { resolvePlannerPolicy, resolveWorkerPolicy } from "@/lib/ai/policy-engine";
import { readEffectiveCostSavingMode } from "@/lib/cost-optimization/metadata";
import { assignmentWithinLimit } from "@/lib/ai/token-limits";
import {
  createWorkflowCostMeter,
  logCostSummary,
  type WorkflowCostMeter,
} from "@/lib/ai/cost-meter";
import { recordOpenAiUsageFromCostSummary } from "@/lib/owner/api-usage/telemetry";
import { recordCostFromOrchestration } from "@/lib/owner/cost-ranking/telemetry";
import {
  recordServiceHealthSuccess,
} from "@/lib/owner/system-status/telemetry";
import {
  buildWorkflowCacheKeyMeta,
  canReplayCachedDeliverable,
  canReplayCachedPlanner,
  getWorkflowCache,
  setWorkflowCache,
} from "@/lib/ai/workflow-cache";
import { WorkflowLimitError } from "@/lib/ai/workflow-limits";
import { resolveCompanyTemplateIdFromMetadata } from "@/lib/company-templates/context";
import type { EmployeeId } from "@/lib/employees/types";
import type { KnowledgeRetrievalResult } from "@/lib/knowledge/types";

import { isAtlasServerDebugEnabled } from "@/lib/debug/atlas-debug";
import { ui } from "@/lib/i18n";
import { orchestrateCore } from "./orchestrate-core";
import { isCoreTestMode } from "./core-workflow";
import { buildDeterministicCeoPhase } from "./ceo-routing";
import {
  buildExecutionsWithDeterministicReviews,
} from "./deterministic-reviewer";
import { buildFinalResponseSummary, buildDeliverable } from "./deliverable-builder";
import { deliverableHasContent, emptyDeliverable } from "./deliverable-types";
import {
  classifyDeliverableType,
  validatePlannerPlanConsistency,
} from "./deliverable-classification";
import {
  createPipelineFailure,
  formatStepErrorMessage,
  PipelineFailure,
  pipelineFailureFromError,
  toStepError,
} from "./errors";
import { ingestWorkflowKnowledge } from "./ingest-knowledge";
import {
  buildPipelineDiagnostics,
  logPipelineDiagnostics,
} from "./pipeline-diagnostics";
import { readAtlasMemoryFromMetadata } from "@/lib/user-memory/metadata";
import { readWorkMemoryFromMetadata } from "@/lib/work-memory/metadata";
import { retrieveExecutiveMemory } from "./knowledge-stage";
import { parseUnifiedPlannerOutput } from "./parse-unified-planner";
import { parseTasksFromPlannerOutput } from "./parse-tasks";
import {
  computeNeedsReviewReason,
  createInitialPipelineExecutionDebug,
  type DeliverableBuilderInputSource,
  inferFailedStageFromPipeline,
  workerPhaseHasOutput,
} from "./pipeline-execution";
import { runQualityLoop } from "./quality-loop";
import { runOptimizedResearchStage } from "./research-optimized";
import { runWorkflowEmployee, resolveWorkflowInstructions } from "./run-employee";
import {
  buildSlimPlannerContext,
  buildSlimWorkerContext,
  extractResearchSummary,
} from "./slim-context";
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
  KnowledgeUsedResult,
  OrchestrationRequest,
  OrchestrationResult,
  OrchestrationStep,
  ResearchStageResult,
  TaskExecutionResult,
  WorkTask,
  WorkflowIsolationDebug,
} from "./types";

function departmentForStep(step: OrchestrationStep, aiTaskType?: AiTaskType): string {
  if (aiTaskType === "planner_unified") return "planning";
  if (aiTaskType === "worker_deliverable" || aiTaskType === "worker_deliverable_light" || aiTaskType === "worker_revision") return "production";
  if (aiTaskType === "research_synthesis") return "research";
  if (aiTaskType === "reviewer_fallback") return "quality-assurance";
  switch (step) {
    case "research_assessment":
    case "research_report":
      return "research";
    case "planner_plan":
    case "planner_tasks":
      return "planning";
    case "worker":
      return "production";
    case "reviewer":
      return "quality-assurance";
    default:
      return "orchestration";
  }
}

async function runPhase(
  step: OrchestrationStep,
  agentId: AgentId,
  task: string,
  context: AgentContext,
  costMeter: WorkflowCostMeter,
  metadata?: Readonly<Record<string, unknown>>,
  employeeId?: EmployeeId,
  aiTaskType?: AiTaskType,
): Promise<AgentPhaseResult> {
  costMeter.assertWithinLimits();
  const start = Date.now();

  const result = await withStepTimeout(
    runWorkflowEmployee(agentId, employeeId, {
      task,
      context: { ...context, metadata: context.metadata ?? metadata },
      aiTaskType,
    }),
    step,
  );

  const instructions = resolveWorkflowInstructions(agentId, employeeId, aiTaskType);
  costMeter.recordLlmCall({
    department: departmentForStep(step, aiTaskType),
    taskType: aiTaskType ?? "planner_unified",
    inputText: task + JSON.stringify(context),
    outputText: result.outputText,
    instructions,
  });
  costMeter.assertWithinLimits();

  return {
    result,
    durationMs: Date.now() - start,
  };
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

function buildExecutionsFromUnifiedWorker(
  tasks: WorkTask[],
  workerPhase: AgentPhaseResult,
  workerAssignments: ReturnType<typeof assignWorkersToTasks>,
  deliverable: ReturnType<typeof buildDeliverable>,
): TaskExecutionResult[] {
  return buildExecutionsWithDeterministicReviews(
    tasks,
    workerPhase,
    workerAssignments,
    deliverable,
  );
}

function buildSuccessResult(
  assignment: string,
  pipelineStart: number,
  ceo: AgentPhaseResult,
  research: ResearchStageResult | undefined,
  plannerPlan: AgentPhaseResult,
  plannerTasks: AgentPhaseResult,
  tasks: WorkTask[],
  executions: TaskExecutionResult[],
  warnings: string[],
  qualityOutput: Awaited<ReturnType<typeof runQualityLoop>>,
  workflowState: WorkflowStateManager,
  knowledgeUsed?: KnowledgeUsedResult,
  costDebug?: OrchestrationResult["costDebug"],
  pipelineDebug?: OrchestrationResult["pipelineDebug"],
  isolationDebug?: WorkflowIsolationDebug,
): OrchestrationResult {
  const sortedExecutions = [...qualityOutput.executions].sort(
    (a, b) => a.task.id - b.task.id,
  );

  const resultWarnings = [...warnings];
  const hasDeliverable = deliverableHasContent(qualityOutput.deliverable);

  if (isolationDebug) {
    isolationDebug.pipeline.deliverableBuilderInputSource =
      qualityOutput.deliverableBuilderInputSource;
  }

  if (!hasDeliverable) {
    resultWarnings.push(
      "要確認 — Deliverable Builder did not produce usable content.",
    );
  } else if (!qualityOutput.approved) {
    resultWarnings.push(
      "要確認 — Final deliverable requires review before release.",
    );
  }

  if (qualityOutput.deliverableRecovered) {
    resultWarnings.push(
      "Deliverable recovered automatically from worker output.",
    );
  }

  if (!qualityOutput.deliverableValidation.valid) {
    resultWarnings.push(
      `要確認 — Missing deliverable fields: ${qualityOutput.deliverableValidation.missingFields.join(", ")}`,
    );
  }

  const approved = qualityOutput.approved && hasDeliverable;

  if (isolationDebug) {
    isolationDebug.pipeline.needsReviewReason = computeNeedsReviewReason({
      approved,
      deliverable: qualityOutput.deliverable,
      warnings: resultWarnings,
      pipeline: isolationDebug.pipeline,
    });
    isolationDebug.pipeline.failedStage =
      inferFailedStageFromPipeline(isolationDebug.pipeline) ??
      (isolationDebug.pipeline.needsReviewReason ? "final_deliverable" : null);
  }

  workflowState.finalize({ hasDeliverable, approved });

  return {
    assignment,
    status: legacyOrchestrationStatus(workflowState.getState()),
    workflow: workflowState.getSnapshot(),
    ceo,
    ...(research ? { research } : {}),
    plannerPlan,
    plannerTasks,
    tasks,
    executions: sortedExecutions,
    deliverable: qualityOutput.deliverable,
    reviewComments: qualityOutput.reviewComments,
    approved,
    finalResponse: qualityOutput.finalResponse,
    totalDurationMs: Date.now() - pipelineStart,
    qualityLoop: qualityOutput.qualityLoop,
    ...(knowledgeUsed ? { knowledge: knowledgeUsed } : {}),
    ...(resultWarnings.length > 0 ? { warnings: resultWarnings } : {}),
    ...(costDebug ? { costDebug } : {}),
    ...(pipelineDebug ? { pipelineDebug } : {}),
    ...(isolationDebug ? { isolationDebug } : {}),
  };
}

function buildFailureResult(
  assignment: string,
  pipelineStart: number,
  partial: {
    ceo: AgentPhaseResult | null;
    research?: ResearchStageResult;
    plannerPlan: AgentPhaseResult | null;
    plannerTasks: AgentPhaseResult | null;
    tasks: WorkTask[];
    executions: TaskExecutionResult[];
    warnings: string[];
  },
  error: unknown,
  step: OrchestrationStep,
  agentId: AgentId,
  workflowState: WorkflowStateManager,
  taskId?: number,
  knowledgeUsed?: KnowledgeUsedResult,
  costDebug?: OrchestrationResult["costDebug"],
  isolationDebug?: WorkflowIsolationDebug,
): OrchestrationResult {
  const stepError = toStepError(error, step, agentId, taskId);
  const failureInfo = pipelineFailureFromError(error, step, agentId, taskId);
  const reviewComments = partial.executions
    .filter((exec) => exec.reviewerStatus === "completed" && exec.reviewer)
    .map(
      (exec) =>
        `## Task ${exec.task.id} — Review\n\n${exec.reviewer!.result.outputText.trim()}`,
    )
    .join("\n\n---\n\n");

  const workflowDeliverable =
    partial.executions.length > 0
      ? buildDeliverable({
          assignment,
          executions: partial.executions,
          research: partial.research,
          plannerPlan: partial.plannerPlan,
          expectedType: classifyDeliverableType(assignment),
        })
      : emptyDeliverable(classifyDeliverableType(assignment));

  const finalResponse =
    buildFinalResponseSummary(workflowDeliverable) ||
    (failureInfo
      ? `${failureInfo.reason}\n\nRecommended action: ${failureInfo.recommendedAction}`
      : error instanceof Error
        ? error.message
        : formatStepErrorMessage(stepError));

  if (error instanceof WorkflowLimitError) {
    partial.warnings.push(`${error.message} — 要確認`);
  }

  if (isolationDebug) {
    isolationDebug.pipeline.failedStage = step;
    isolationDebug.pipeline.needsReviewReason =
      error instanceof PipelineFailure
        ? error.info.reason
        : error instanceof Error
          ? error.message
          : formatStepErrorMessage(stepError);
  }

  const failureResult: OrchestrationResult = {
    assignment,
    status: legacyOrchestrationStatus(workflowState.getState()),
    workflow: workflowState.getSnapshot(),
    ceo: partial.ceo,
    ...(partial.research ? { research: partial.research } : {}),
    plannerPlan: partial.plannerPlan,
    plannerTasks: partial.plannerTasks,
    tasks: partial.tasks,
    executions: partial.executions,
    deliverable: deliverableHasContent(workflowDeliverable)
      ? workflowDeliverable
      : emptyDeliverable(),
    reviewComments,
    approved: false,
    finalResponse,
    totalDurationMs: Date.now() - pipelineStart,
    error: failureInfo
      ? `[${failureInfo.department}] ${failureInfo.reason}`
      : formatStepErrorMessage(stepError),
    stepError,
    ...(partial.warnings.length > 0 ? { warnings: partial.warnings } : {}),
    ...(knowledgeUsed ? { knowledge: knowledgeUsed } : {}),
    ...(costDebug ? { costDebug } : {}),
    ...(isolationDebug ? { isolationDebug } : {}),
  };

  if (isAtlasServerDebugEnabled()) {
    const pipelineDebug = buildPipelineDiagnostics({
      result: failureResult,
    });
    logPipelineDiagnostics(pipelineDebug);
    failureResult.pipelineDebug = pipelineDebug;
  }

  return failureResult;
}

/**
 * Cost-optimized Atlas workflow (v1).
 *
 * Normal path: Planner (1) + Worker (1) = 2 LLM calls.
 * Research-heavy: + Research synthesis (1) = 3 LLM calls max.
 * QA / CEO / Reviewer per-task: deterministic rules (no LLM).
 */
export async function orchestrate(
  request: OrchestrationRequest,
): Promise<OrchestrationResult> {
  if (isCoreTestMode()) {
    return orchestrateCore(request);
  }

  const pipelineStart = Date.now();
  const assignment = request.assignment.trim();
  if (!assignmentWithinLimit(assignment)) {
    throw new WorkflowLimitError(
      "依頼内容が長すぎます。8,000文字以内に分割して再試行してください。",
    );
  }
  const metadata = request.metadata;
  const warnings: string[] = [];
  const costMeter = createWorkflowCostMeter();

  let ceo: AgentPhaseResult | null = null;
  let research: ResearchStageResult | undefined;
  let knowledgeUsed: KnowledgeUsedResult | undefined;
  let plannerPlan: AgentPhaseResult | null = null;
  let plannerTasks: AgentPhaseResult | null = null;
  let tasks: WorkTask[] = [];
  let executions: TaskExecutionResult[] = [];
  let currentStep: OrchestrationStep = "ceo";
  let currentTaskId: number | undefined;
  let workflowStateManager: WorkflowStateManager | null = null;
  let isolationDebug: WorkflowIsolationDebug | undefined;

  const trackStep = (step: OrchestrationStep, taskId?: number) => {
    currentStep = step;
    currentTaskId = taskId;
    workflowStateManager?.transitionForStep(step);
  };

  const runPhaseBound = (
    step: OrchestrationStep,
    agentId: AgentId,
    task: string,
    context: AgentContext,
    phaseMetadata?: Readonly<Record<string, unknown>>,
    employeeId?: EmployeeId,
    aiTaskType?: AiTaskType,
  ) =>
    runPhase(
      step,
      agentId,
      task,
      context,
      costMeter,
      phaseMetadata ?? metadata,
      employeeId,
      aiTaskType,
    );

  try {
    const workflowId = crypto.randomUUID();
    workflowStateManager = new WorkflowStateManager(workflowId);
    const deliverableType = classifyDeliverableType(assignment);
    const retrieval = await retrieveExecutiveMemory(assignment, workflowId, deliverableType);
    knowledgeUsed = { workflowId, retrieval };

    const cacheKeyInput = {
      assignment,
      companyTemplateId: resolveCompanyTemplateIdFromMetadata(metadata),
      companyId: typeof metadata?.companyId === "string" ? metadata.companyId : undefined,
      deliverableType,
    };
    const cacheKeyMeta = buildWorkflowCacheKeyMeta(cacheKeyInput);
    const cacheKey = cacheKeyMeta.key;

    const isolation: WorkflowIsolationDebug = {
      cacheKey,
      assignmentHash: cacheKeyMeta.assignmentHash,
      deliverableType,
      workflowVersion: cacheKeyMeta.workflowVersion,
      policyVersion: cacheKeyMeta.policyVersion,
      cacheReplay: { planner: false, worker: false, research: false },
      knowledge: retrieval.diagnostics,
      pipeline: createInitialPipelineExecutionDebug(),
    };
    isolationDebug = isolation;

    const atlasMemory = readAtlasMemoryFromMetadata(metadata);
    const workMemory = readWorkMemoryFromMetadata(metadata);
    const plannerKnowledge = [
      retrieval.plannerContext.similarProjects,
      retrieval.plannerContext.successfulStrategies,
      atlasMemory,
      workMemory,
    ]
      .filter(Boolean)
      .join("\n\n");

    trackStep("ceo");
    ceo = buildDeterministicCeoPhase(assignment, retrieval, deliverableType);

    research = await runOptimizedResearchStage({
      assignment,
      cacheKeyInput,
      metadata,
      runPhase: runPhaseBound,
      trackStep,
      costMeter,
      knowledgeSummary: null,
    });

    if (research.assessmentStatus === "failed") {
      warnings.push(
        research.assessmentError ??
          "Research assessment failed; proceeding without external research.",
      );
    }
    if (research.reportStatus === "failed") {
      warnings.push(
        research.reportError ??
          "Research report generation failed; proceeding without research report.",
      );
    }

    if (research.reportPhase?.result.model === "cache") {
      isolation.cacheReplay.research = true;
    }

    const resolvedResearchSummary = extractResearchSummary(research);
    const costSavingMode = readEffectiveCostSavingMode(metadata);
    const plannerPolicy = resolvePlannerPolicy({
      assignment,
      deliverableType,
      costSavingMode,
    });

    trackStep("planner_plan");
    const cacheEntry = getWorkflowCache(cacheKey);
    const cachedPlanner = canReplayCachedPlanner(cacheEntry, deliverableType)
      ? cacheEntry?.planner
      : undefined;

    let unifiedPlannerOutput: string;
    if (cachedPlanner) {
      isolation.cacheReplay.planner = true;
      unifiedPlannerOutput = cachedPlanner.outputText;
      costMeter.recordLlmCall({
        department: "planning",
        taskType: plannerPolicy.taskType,
        inputText: assignment,
        outputText: unifiedPlannerOutput,
        cached: true,
      });
      plannerPlan = {
        result: {
          agentId: "planner",
          role: "planner",
          name: "Lead Planner",
          outputText: cachedPlanner.planText,
          responseId: `planner-cache-${cacheKey}`,
          status: "completed",
          model: "cache",
        },
        durationMs: 0,
      };
    } else {
      plannerPlan = await runPhaseBound(
        "planner_plan",
        "planner",
        buildCompactPlannerTaskPrompt(assignment, deliverableType),
        buildSlimPlannerContext(
          assignment,
          resolvedResearchSummary,
          deliverableType,
          plannerKnowledge || null,
        ),
        metadata,
        undefined,
        plannerPolicy.taskType,
      );
      unifiedPlannerOutput = plannerPlan.result.outputText;
      setWorkflowCache(cacheKey, {
        planner: {
          planText: unifiedPlannerOutput,
          tasksJson: unifiedPlannerOutput,
          outputText: unifiedPlannerOutput,
          deliverableType,
        },
        deliverableType,
      });
    }

    isolation.pipeline.plannerExecuted = true;

    const parsed = parseUnifiedPlannerOutput(
      unifiedPlannerOutput,
      assignment,
      parseTasksFromPlannerOutput,
    );
    tasks = parsed.tasks;
    if (parsed.parseResult.warning) {
      warnings.push(parsed.parseResult.warning);
    }

    const planValidation = validatePlannerPlanConsistency(
      assignment,
      deliverableType,
      tasks,
      parsed.deliverableType,
    );
    if (!planValidation.ok) {
      throw createPipelineFailure(
        "planner_plan",
        "planner",
        planValidation.message ??
          "依頼内容と作業計画が一致しませんでした。再実行してください。",
        "依頼内容を確認して再実行してください。",
      );
    }

    plannerTasks = buildSyntheticPlannerTasksPhase(tasks);
    const planSummary = parsed.plan;
    const workerAssignments = assignWorkersToTasks(tasks);

    const workerPolicy = resolveWorkerPolicy({
      deliverableType,
      costSavingMode,
    });
    const workerTaskType = workerPolicy.taskType;

    trackStep("worker");
    const workerCacheEntry = getWorkflowCache(cacheKey);
    const cachedDeliverable =
      workerCacheEntry &&
      canReplayCachedDeliverable(workerCacheEntry, deliverableType)
        ? workerCacheEntry.deliverable
        : undefined;
    const cachedWorkerOutput = workerCacheEntry?.workerOutput;
    let workerPhase: AgentPhaseResult;
    let deliverableBuilderInputSource: DeliverableBuilderInputSource = "worker";

    if (cachedDeliverable && deliverableHasContent(cachedDeliverable)) {
      isolation.cacheReplay.worker = true;
      deliverableBuilderInputSource = "cache";
      const replayOutput =
        cachedWorkerOutput?.trim() || JSON.stringify(cachedDeliverable);
      costMeter.recordLlmCall({
        department: "production",
        taskType: workerTaskType,
        inputText: assignment,
        outputText: replayOutput,
        cached: true,
      });
      workerPhase = {
        result: {
          agentId: "worker",
          role: "worker",
          name: "Production",
          outputText: replayOutput,
          responseId: `worker-cache-${cacheKey}`,
          status: "completed",
          model: "cache",
        },
        durationMs: 0,
      };
    } else {
      workerPhase = await runPhaseBound(
        "worker",
        "worker",
        buildCompactUnifiedWorkerTaskPrompt(tasks, deliverableType),
        buildSlimWorkerContext({
          assignment,
          deliverableType,
          planSummary,
          researchSummary: resolvedResearchSummary,
          workerKnowledge: retrieval.workerContext ?? null,
        }),
        metadata,
        workerAssignments[0]?.employeeId ?? "development-senior-dev",
        workerTaskType,
      );
    }

    isolation.pipeline.workerExecuted = true;
    isolation.pipeline.workerOutputExists = workerPhaseHasOutput(
      workerPhase.result.outputText,
    );
    isolation.pipeline.deliverableBuilderInputSource = deliverableBuilderInputSource;

    assertWorkerStageExecuted(isolation.pipeline.workerExecuted);

    if (!isolation.pipeline.workerOutputExists) {
      throw createPipelineFailure(
        "worker",
        "worker",
        ui.work.workerDeliverableFailed,
        "依頼内容を具体化して、もう一度実行してください。",
      );
    }

    const provisionalDeliverable = buildDeliverable({
      assignment,
      executions: [
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
      research,
      plannerPlan,
      expectedType: deliverableType,
    });

    executions = buildExecutionsFromUnifiedWorker(
      tasks,
      workerPhase,
      workerAssignments,
      provisionalDeliverable,
    );

    assertWorkersProducedDeliverables(
      executions.filter((e) => e.worker),
      assignment,
      deliverableType,
    );

    trackStep("reviewer");
    trackStep("final_deliverable");

    const qualityOutput = await runQualityLoop({
      assignment,
      research,
      plannerPlan,
      plannerTasks,
      tasks,
      executions,
      workerAssignments,
      deliverableType,
      researchSummary: resolvedResearchSummary,
      planSummary,
      metadata,
      runPhase: runPhaseBound,
      trackStep,
      costMeter,
      workflowState: workflowStateManager,
    });

    if (deliverableHasContent(qualityOutput.deliverable)) {
      const finalWorkerOutput =
        qualityOutput.executions.find(
          (exec) => exec.workerStatus === "completed" && exec.worker?.result.outputText.trim(),
        )?.worker?.result.outputText.trim() ?? workerPhase.result.outputText.trim();

      setWorkflowCache(cacheKey, {
        deliverable: qualityOutput.deliverable,
        workerOutput: finalWorkerOutput,
        deliverableType,
      });
    }

    isolation.pipeline.deliverableBuilderInputSource =
      qualityOutput.deliverableBuilderInputSource;

    const attachDebugMetrics =
      isAtlasServerDebugEnabled() || process.env.NODE_ENV !== "production";
    const costDebug = attachDebugMetrics ? costMeter.getSummary() : undefined;
    const costSummary = costMeter.getSummary();
    logCostSummary(costSummary);
    recordOpenAiUsageFromCostSummary(costSummary);
    recordCostFromOrchestration({
      assignment,
      metadata,
      deliverableType: qualityOutput.deliverable?.type ?? deliverableType,
      userId: typeof metadata?.userId === "string" ? metadata.userId : null,
      costUsd: costSummary.estimatedCostUsd,
      durationMs: Date.now() - pipelineStart,
      source:
        typeof metadata?.automationId === "string" ? "automation" : "orchestration",
    });
    recordServiceHealthSuccess("openai", "orchestration");
    recordServiceHealthSuccess("atlas", "orchestration");

    const successResult = buildSuccessResult(
      assignment,
      pipelineStart,
      ceo,
      research,
      plannerPlan,
      plannerTasks,
      tasks,
      qualityOutput.executions,
      warnings,
      qualityOutput,
      workflowStateManager,
      knowledgeUsed,
      costDebug,
      undefined,
      attachDebugMetrics ? isolationDebug : undefined,
    );

    if (attachDebugMetrics) {
      const pipelineDebug = buildPipelineDiagnostics({
        result: successResult,
        deliverableValidation: qualityOutput.deliverableValidation,
        deliverableRecovered: qualityOutput.deliverableRecovered,
      });
      if (process.env.ATLAS_DEBUG === "true" && process.env.NODE_ENV !== "production") {
        logPipelineDiagnostics(pipelineDebug);
      }
      successResult.pipelineDebug = pipelineDebug;
    }

    await ingestWorkflowKnowledge(workflowId, successResult, metadata);
    return successResult;
  } catch (error) {
    const failedStep =
      error instanceof OrchestrationTimeoutError ? error.step : currentStep;

    const attachDebugMetrics =
      isAtlasServerDebugEnabled() || process.env.NODE_ENV !== "production";
    const costDebug = attachDebugMetrics ? costMeter.getSummary() : undefined;
    const costSummary = costMeter.getSummary();
    logCostSummary(costSummary);
    recordOpenAiUsageFromCostSummary(costSummary);
    recordCostFromOrchestration({
      assignment,
      metadata,
      deliverableType: classifyDeliverableType(assignment),
      userId: typeof metadata?.userId === "string" ? metadata.userId : null,
      costUsd: costSummary.estimatedCostUsd,
      durationMs: Date.now() - pipelineStart,
      source:
        typeof metadata?.automationId === "string" ? "automation" : "orchestration",
    });

    if (!workflowStateManager) {
      workflowStateManager = new WorkflowStateManager(crypto.randomUUID());
    }

    if (isolationDebug) {
      isolationDebug.pipeline.plannerExecuted =
        isolationDebug.pipeline.plannerExecuted || Boolean(plannerPlan);
      isolationDebug.pipeline.workerExecuted =
        isolationDebug.pipeline.workerExecuted ||
        executions.some(
          (exec) => exec.workerStatus === "completed" && exec.worker?.result.outputText.trim(),
        );
      isolationDebug.pipeline.workerOutputExists =
        isolationDebug.pipeline.workerOutputExists ||
        executions.some((exec) => workerPhaseHasOutput(exec.worker?.result.outputText));
      if (!isolationDebug.pipeline.failedStage) {
        isolationDebug.pipeline.failedStage = failedStep;
      }
      if (!isolationDebug.pipeline.needsReviewReason) {
        isolationDebug.pipeline.needsReviewReason =
          error instanceof PipelineFailure
            ? error.info.reason
            : error instanceof Error
              ? error.message
              : null;
      }
    }

    const failureMessage =
      error instanceof Error ? error.message : "Workflow failed unexpectedly";
    workflowStateManager.fail(failureMessage, {
      timedOut: error instanceof OrchestrationTimeoutError,
    });

    return buildFailureResult(
      assignment,
      pipelineStart,
      { ceo, research, plannerPlan, plannerTasks, tasks, executions, warnings },
      error,
      failedStep,
      stepToAgentId(failedStep),
      workflowStateManager,
      currentTaskId,
      knowledgeUsed,
      costDebug,
      attachDebugMetrics ? isolationDebug : undefined,
    );
  }
}

function stepToAgentId(step: OrchestrationStep): AgentId {
  switch (step) {
    case "ceo":
      return "ceo";
    case "research_assessment":
    case "research_report":
      return "worker";
    case "planner_plan":
    case "planner_tasks":
      return "planner";
    case "worker":
      return "worker";
    case "reviewer":
      return "reviewer";
    case "quality_assurance":
      return "reviewer";
    case "ceo_approval":
      return "ceo";
    case "final_deliverable":
      return "reviewer";
  }
}

import "server-only";

import type { AgentContext } from "@/lib/agents/types";
import type { AgentId } from "@/lib/agents/types";
import type { AiTaskType } from "@/lib/ai/model-policy";
import type { WorkflowCostMeter } from "@/lib/ai/cost-meter";
import { WORKFLOW_LIMITS } from "@/lib/ai/workflow-limits";
import type { EmployeeId } from "@/lib/employees/types";
import type { KnowledgeRetrievalResult } from "@/lib/knowledge/types";
import type { Deliverable } from "@/lib/orchestration/deliverable-types";
import type {
  AgentPhaseResult,
  OrchestrationStep,
  WorkTask,
} from "@/lib/orchestration/types";
import { buildDeliverable } from "@/lib/orchestration/deliverable-builder";
import type { ResearchStageResult } from "@/lib/orchestration/types";
import { buildSlimWorkerContext } from "@/lib/orchestration/slim-context";
import { resolveWorkerPolicy } from "@/lib/ai/policy-engine";

import {
  buildQualityContextPack,
  formatContextPackForPrompt,
  type QualityContextPack,
} from "./context-pack";
import { applyFormatterToDeliverable } from "./formatter";
import { parseLlmQualityJudge, runRulesQualityJudge } from "./judge";
import {
  maxImproveRounds,
  resolveQualityEngineTier,
  resolveQualityPromptKind,
  shouldRunLlmJudge,
  shouldRunLlmReviewer,
  QUALITY_JUDGE_PASS_SCORE,
} from "./policy";
import {
  buildQualityImprovePrompt,
  buildQualityJudgePrompt,
  buildQualityReviewerPrompt,
} from "./prompts";
import { parseLlmQualityReviewer, runRulesQualityReviewer } from "./reviewer";
import { getSectionsForKind } from "./sections";
import { getSpecialistProfile } from "./specialists";
import { recordQualityEngineTelemetry } from "./telemetry-store";
import type {
  QualityEngineRunResult,
  QualityEngineStageTiming,
  QualityJudgeResult,
  QualityReviewerResult,
  WriterBrief,
} from "./types";
import { buildWriterBrief } from "./writer-brief";

type RunPhaseFn = (
  step: OrchestrationStep,
  agentId: AgentId,
  task: string,
  context: AgentContext,
  metadata?: Readonly<Record<string, unknown>>,
  employeeId?: EmployeeId,
  aiTaskType?: AiTaskType,
) => Promise<AgentPhaseResult>;

export type RunQualityEngineInput = {
  assignment: string;
  deliverable: Deliverable;
  deliverableType: string;
  tasks: WorkTask[];
  planSummary: string;
  researchSummary?: string | null;
  research?: ResearchStageResult;
  plannerPlan: AgentPhaseResult | null;
  metadata?: Readonly<Record<string, unknown>>;
  knowledge?: KnowledgeRetrievalResult | null;
  /** Pre-built brief optional — otherwise built here. */
  writerBrief?: WriterBrief;
  contextPack?: QualityContextPack;
  primaryEmployeeId: EmployeeId;
  runPhase: RunPhaseFn;
  trackStep: (step: OrchestrationStep, taskId?: number) => void;
  costMeter: WorkflowCostMeter;
  /** Planner/writer wall times already spent (for owner log). */
  priorTimings?: Partial<QualityEngineStageTiming>;
  /** Rebuild deliverable after Writer improve. */
  rebuildDeliverable: (workerPhase: AgentPhaseResult) => Deliverable;
};

function canCallLlm(costMeter: WorkflowCostMeter): boolean {
  return costMeter.getCallCount() < WORKFLOW_LIMITS.maxLlmCalls;
}

/**
 * Quality Engine: Reviewer → Judge → optional improve (max 2) → Formatter.
 * Fast tier skips LLM and only applies rules + formatter.
 * Does not rewrite Planner/Deliverable cores — operates on the built deliverable.
 */
export async function runQualityEngine(
  input: RunQualityEngineInput,
): Promise<QualityEngineRunResult & { deliverable: Deliverable }> {
  const tier = resolveQualityEngineTier({
    deliverableType: input.deliverableType,
    metadata: input.metadata,
    assignment: input.assignment,
  });
  const promptKind = resolveQualityPromptKind({
    assignment: input.assignment,
    deliverableType: input.deliverableType,
    metadata: input.metadata,
  });
  const contextPack =
    input.contextPack ??
    buildQualityContextPack({
      assignment: input.assignment,
      deliverableType: input.deliverableType,
      metadata: input.metadata,
      knowledge: input.knowledge,
      promptKind,
    });
  const brief =
    input.writerBrief ??
    buildWriterBrief({
      assignment: input.assignment,
      deliverableType: input.deliverableType,
      planSummary: input.planSummary,
      metadata: input.metadata,
      contextPack,
    });
  const specialist = getSpecialistProfile(promptKind);

  const timings: QualityEngineStageTiming = {
    plannerMs: input.priorTimings?.plannerMs ?? 0,
    writerMs: input.priorTimings?.writerMs ?? 0,
    reviewerMs: 0,
    judgeMs: 0,
    formatterMs: 0,
    improveMs: 0,
  };

  let deliverable = input.deliverable;
  let improveCount = 0;
  let reviewerCount = 0;
  let reviewer: QualityReviewerResult | null = null;
  let judge: QualityJudgeResult;

  // --- Specialist Reviewer ---
  input.trackStep("reviewer");
  const rulesReviewer = runRulesQualityReviewer({
    deliverable,
    kind: promptKind,
    brief,
    contextPack,
  });
  reviewer = rulesReviewer;
  reviewerCount += 1;
  timings.reviewerMs = rulesReviewer.durationMs;

  if (
    shouldRunLlmReviewer(tier) &&
    canCallLlm(input.costMeter) &&
    (!rulesReviewer.approved || tier === "full")
  ) {
    try {
      input.costMeter.assertWithinLimits();
      const started = Date.now();
      const phase = await input.runPhase(
        "reviewer",
        "reviewer",
        buildQualityReviewerPrompt({
          kind: promptKind,
          markdown: deliverable.markdown || deliverable.content,
          brief,
          contextPack,
        }),
        {
          assignment: input.assignment.slice(0, 2_000),
          priorOutputs: [
            {
              agentId: "worker",
              role: "worker",
              output: (deliverable.markdown || deliverable.content).slice(0, 3_500),
            },
          ],
        },
        input.metadata,
        undefined,
        "reviewer_fallback",
      );
      reviewer = parseLlmQualityReviewer(phase.result.outputText, rulesReviewer);
      reviewerCount += 1;
      timings.reviewerMs += Date.now() - started;
    } catch {
      reviewer = rulesReviewer;
    }
  }

  // --- Judge + improve loop ---
  const maxImprove = maxImproveRounds(tier);
  const sectionTitles = getSectionsForKind(promptKind).map((s) => s.title);

  for (let attempt = 0; attempt <= maxImprove; attempt++) {
    input.trackStep("quality_assurance");
    const rulesJudge = runRulesQualityJudge({
      deliverable,
      kind: promptKind,
      requiredSectionTitles: sectionTitles,
      hasBusinessProfile: Boolean(contextPack.businessProfileSummary),
      hasVision: Boolean(contextPack.visionSummary),
    });
    judge = rulesJudge;
    timings.judgeMs += rulesJudge.durationMs;

    if (shouldRunLlmJudge(tier) && canCallLlm(input.costMeter) && attempt === 0) {
      try {
        input.costMeter.assertWithinLimits();
        const started = Date.now();
        const phase = await input.runPhase(
          "quality_assurance",
          "reviewer",
          buildQualityJudgePrompt({
            kind: promptKind,
            markdown: deliverable.markdown || deliverable.content,
          }),
          {
            assignment: input.assignment.slice(0, 1_500),
            priorOutputs: [
              {
                agentId: "worker",
                role: "worker",
                output: (deliverable.markdown || deliverable.content).slice(0, 3_500),
              },
            ],
          },
          input.metadata,
          undefined,
          "reviewer_fallback",
        );
        judge = parseLlmQualityJudge(
          phase.result.outputText,
          rulesJudge,
          promptKind,
        );
        timings.judgeMs += Date.now() - started;
      } catch {
        judge = rulesJudge;
      }
    }

    const needsImprove =
      (!judge.passed || judge.overallScore < QUALITY_JUDGE_PASS_SCORE) &&
      attempt < maxImprove &&
      canCallLlm(input.costMeter);

    if (!needsImprove) break;

    const improveStarted = Date.now();
    try {
      input.costMeter.assertWithinLimits();
      input.trackStep("worker", 1);
      const feedback = [
        judge.feedback,
        reviewer && !reviewer.approved ? reviewer.feedback : "",
        formatContextPackForPrompt(contextPack),
      ]
        .filter(Boolean)
        .join("\n\n");

      const workerPhase = await input.runPhase(
        "worker",
        "worker",
        buildQualityImprovePrompt({
          kind: promptKind,
          feedback,
          weakSections: judge.weakSections,
        }),
        buildSlimWorkerContext({
          assignment: input.assignment,
          deliverableType: deliverable.type,
          planSummary: input.planSummary,
          researchSummary: input.researchSummary,
          qualityRequirements: feedback.slice(0, 1_500),
          workerKnowledge: formatContextPackForPrompt(contextPack),
        }),
        input.metadata,
        input.primaryEmployeeId,
        resolveWorkerPolicy({
          deliverableType: input.deliverableType,
          revision: true,
        }).taskType,
      );

      deliverable = input.rebuildDeliverable(workerPhase);
      improveCount += 1;
    } catch {
      break;
    } finally {
      timings.improveMs += Date.now() - improveStarted;
    }
  }

  // Final judge snapshot if improve ran
  if (improveCount > 0) {
    judge = runRulesQualityJudge({
      deliverable,
      kind: promptKind,
      requiredSectionTitles: sectionTitles,
      hasBusinessProfile: Boolean(contextPack.businessProfileSummary),
      hasVision: Boolean(contextPack.visionSummary),
    });
    timings.judgeMs += judge.durationMs;
  }

  // --- Formatter ---
  input.trackStep("final_deliverable");
  const formatted = applyFormatterToDeliverable(deliverable);
  deliverable = formatted.deliverable;
  timings.formatterMs = formatted.durationMs;

  const usage = contextPack.knowledgeUsage;
  const result: QualityEngineRunResult = {
    telemetry: {
      tier,
      promptKind,
      specialistLabel: specialist.label,
      improveCount,
      reviewerCount,
      finalScore: judge!.overallScore,
      judgeFocus: judge!.focus,
      passed: judge!.passed,
      timings,
      reviewerUsedLlm: Boolean(reviewer?.usedLlm),
      judgeSource: judge!.source,
      knowledgeUsage: {
        businessProfile: usage.businessProfile,
        reference: usage.reference,
        template: usage.template,
        knowledge: usage.knowledge,
        contextChars: usage.contextChars,
        layersUsed: [...usage.layersUsed],
        entryCount: usage.entryCount,
      },
      recordedAt: new Date().toISOString(),
    },
    judge: judge!,
    reviewer,
    improveCount,
    formattedMarkdown: deliverable.markdown,
    formattedContent: deliverable.content,
  };

  recordQualityEngineTelemetry({
    ...result.telemetry,
    userId:
      typeof input.metadata?.userId === "string"
        ? input.metadata.userId
        : typeof input.metadata?.progressUserId === "string"
          ? input.metadata.progressUserId
          : null,
    assignmentHint: input.assignment.slice(0, 120),
  });

  return { ...result, deliverable };
}

/** Helper used by orchestrator to build sectioned writer prompt inputs. */
export function prepareQualityWriterBundle(input: {
  assignment: string;
  deliverableType: string;
  planSummary: string;
  metadata?: Readonly<Record<string, unknown>>;
  knowledge?: KnowledgeRetrievalResult | null;
}): {
  tier: ReturnType<typeof resolveQualityEngineTier>;
  promptKind: ReturnType<typeof resolveQualityPromptKind>;
  contextPack: QualityContextPack;
  brief: WriterBrief;
} {
  const tier = resolveQualityEngineTier({
    deliverableType: input.deliverableType,
    metadata: input.metadata,
    assignment: input.assignment,
  });
  const promptKind = resolveQualityPromptKind({
    assignment: input.assignment,
    deliverableType: input.deliverableType,
    metadata: input.metadata,
  });
  const contextPack = buildQualityContextPack({
    assignment: input.assignment,
    deliverableType: input.deliverableType,
    metadata: input.metadata,
    knowledge: input.knowledge,
    promptKind,
  });
  const brief = buildWriterBrief({
    assignment: input.assignment,
    deliverableType: input.deliverableType,
    planSummary: input.planSummary,
    metadata: input.metadata,
    contextPack,
  });
  return { tier, promptKind, contextPack, brief };
}

export function rebuildDeliverableFromWorkerPhase(input: {
  assignment: string;
  workerPhase: AgentPhaseResult;
  tasks: WorkTask[];
  research?: ResearchStageResult;
  plannerPlan: AgentPhaseResult | null;
  deliverableType: string;
  primaryEmployeeId: EmployeeId;
}): Deliverable {
  return buildDeliverable({
    assignment: input.assignment,
    executions: input.tasks.map((task) => ({
      task,
      assignedEmployeeId: input.primaryEmployeeId,
      worker: input.workerPhase,
      workerStatus: "completed" as const,
      reviewer: null,
      reviewerStatus: "skipped" as const,
      approved: false,
    })),
    research: input.research,
    plannerPlan: input.plannerPlan,
    expectedType: input.deliverableType as Deliverable["type"],
  });
}

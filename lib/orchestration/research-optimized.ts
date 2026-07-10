import "server-only";

import type { AgentContext } from "@/lib/agents/types";
import type { AgentId } from "@/lib/agents/types";
import type { EmployeeId } from "@/lib/employees/types";
import type { AiTaskType } from "@/lib/ai/model-policy";
import type { WorkflowCostMeter } from "@/lib/ai/cost-meter";
import type { DeliverableType } from "./deliverable-types";
import {
  buildWorkflowCacheKey,
  canReplayCachedResearch,
  getWorkflowCache,
  setWorkflowCache,
  type WorkflowCacheKeyInput,
} from "@/lib/ai/workflow-cache";

import { buildSlimPlannerContext } from "./slim-context";
import { buildResearchReportTaskPrompt } from "@/lib/agents/tasks/research-tasks";
import {
  formatResearchReportForContext,
  parseResearchReportOutput,
} from "./parse-research";
import type {
  AgentPhaseResult,
  OrchestrationStep,
  ResearchAssessment,
  ResearchCategory,
  ResearchStageResult,
} from "./types";

const RESEARCH_LEAD_ID: EmployeeId = "research-lead";

type RunPhaseFn = (
  step: OrchestrationStep,
  agentId: AgentId,
  task: string,
  context: AgentContext,
  metadata?: Readonly<Record<string, unknown>>,
  employeeId?: EmployeeId,
  aiTaskType?: AiTaskType,
) => Promise<AgentPhaseResult>;

export type OptimizedResearchParams = {
  assignment: string;
  cacheKeyInput: WorkflowCacheKeyInput;
  metadata?: Readonly<Record<string, unknown>>;
  runPhase: RunPhaseFn;
  trackStep: (step: OrchestrationStep, taskId?: number) => void;
  costMeter: WorkflowCostMeter;
  knowledgeSummary?: string | null;
};

const RESEARCH_KEYWORDS =
  /トレンド|trend|市場|market|競合|competitor|調査|research|リサーチ|統計|statistic|最新|seo|データ|分析/i;

function assessResearchNeedRules(
  assignment: string,
  deliverableType?: DeliverableType,
): ResearchAssessment {
  if (deliverableType === "email" && !RESEARCH_KEYWORDS.test(assignment)) {
    return {
      required: false,
      categories: [],
      rationale:
        "Email deliverable without research keywords; proceeding with assignment only.",
    };
  }

  const required = RESEARCH_KEYWORDS.test(assignment);
  const categories: ResearchCategory[] = required
    ? ["web_research", "market_research"]
    : [];

  return {
    required,
    categories,
    rationale: required
      ? "Assignment references trends, market, or research — external context recommended."
      : "No research keywords detected; proceeding with assignment and knowledge base only.",
  };
}

function buildSyntheticAssessmentPhase(assessment: ResearchAssessment): AgentPhaseResult {
  return {
    result: {
      agentId: "worker",
      role: "worker",
      name: "Research Lead",
      outputText: JSON.stringify(assessment),
      responseId: `research-assess-rules-${crypto.randomUUID()}`,
      status: "completed",
      model: "atlas-rules",
    },
    durationMs: 0,
  };
}

/** Research: rules assessment + cache + optional 1 synthesis LLM call. */
export async function runOptimizedResearchStage(
  params: OptimizedResearchParams,
): Promise<ResearchStageResult> {
  const { assignment, cacheKeyInput, runPhase, trackStep, costMeter, knowledgeSummary } =
    params;

  trackStep("research_assessment");
  const assessment = assessResearchNeedRules(assignment, cacheKeyInput.deliverableType);
  const assessmentPhase = buildSyntheticAssessmentPhase(assessment);

  if (!assessment.required) {
    return {
      assessment,
      assessmentPhase,
      assessmentStatus: "completed",
      report: null,
      reportPhase: null,
      reportStatus: "skipped",
    };
  }

  const cacheKey = buildWorkflowCacheKey(cacheKeyInput);
  const cacheEntry = getWorkflowCache(cacheKey);
  const cached = canReplayCachedResearch(cacheEntry, cacheKeyInput.deliverableType)
    ? cacheEntry?.research
    : undefined;

  if (cached) {
    costMeter.recordLlmCall({
      department: "research",
      taskType: "research_synthesis",
      inputText: assignment,
      outputText: cached.executiveSummary,
      cached: true,
    });

    return {
      assessment,
      assessmentPhase,
      assessmentStatus: "completed",
      report: cached,
      reportPhase: {
        result: {
          agentId: "worker",
          role: "worker",
          name: "Research Lead",
          outputText: formatResearchReportForContext(cached),
          responseId: `research-cache-${cacheKey}`,
          status: "completed",
          model: "cache",
        },
        durationMs: 0,
      },
      reportStatus: "completed",
    };
  }

  trackStep("research_report");

  try {
    const context = buildSlimPlannerContext(
      assignment,
      knowledgeSummary ?? null,
    );

    const reportPhase = await runPhase(
      "research_report",
      "worker",
      buildResearchReportTaskPrompt(assessment.categories),
      context,
      params.metadata,
      RESEARCH_LEAD_ID,
      "research_synthesis",
    );

    const report = parseResearchReportOutput(reportPhase.result.outputText);
    if (!report.executiveSummary && report.keyFindings.length === 0) {
      report.fullText = reportPhase.result.outputText.trim();
      report.executiveSummary = report.fullText.slice(0, 500);
    }

    setWorkflowCache(cacheKey, {
      research: report,
      deliverableType: cacheKeyInput.deliverableType,
    });

    return {
      assessment,
      assessmentPhase,
      assessmentStatus: "completed",
      report,
      reportPhase,
      reportStatus: "completed",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Research synthesis failed";

    return {
      assessment,
      assessmentPhase,
      assessmentStatus: "completed",
      report: null,
      reportPhase: null,
      reportStatus: "failed",
      reportError: message,
    };
  }
}
